import {seedPortal,portalFeed} from './portal.mjs';
import {createRoleAgent,studentCapabilities,teacherCapabilities} from './role-agent.mjs';
import {createDeanAgent,deanCapabilities} from './agent.mjs';
import {createDeanRoutes} from './dean.mjs';
import {publicUser} from './store.mjs';
export class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(code,message)=>{throw new ApiError(code,message);};
const text=(x,max=2000)=>{if(typeof x!=='string'||!x.trim()||x.length>max)fail(400,'Проверьте обязательные поля и длину текста.');return x.trim();};
const id=x=>{if(!Number.isSafeInteger(Number(x))||Number(x)<1)fail(400,'Некорректный идентификатор.');return Number(x);};
const requireRole=(u,...roles)=>{if(!roles.includes(u.role))fail(403,'Недостаточно прав.');};
const confirmed=b=>{if(b.confirm!==true)fail(400,'Сначала подтвердите действие.');};
const version=(row,b)=>{if(!row)fail(404,'Запись не найдена.');if(row.version!==b.version)fail(409,'Данные уже изменились. Обновите раздел и повторите действие.');};
export function createRoutes(s){
 const deanRoutes=createDeanRoutes(s);
 s.db.exec('CREATE TABLE IF NOT EXISTS direct_messages(id INTEGER PRIMARY KEY,author TEXT NOT NULL REFERENCES users(login),recipient TEXT NOT NULL REFERENCES users(login),body TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS direct_pair ON direct_messages(author,recipient,id)');
 seedPortal(s);
 s.transaction(()=>{
  if(!s.run("INSERT OR IGNORE INTO demo_updates VALUES('demo-private-consultation')").changes)return;
  const insert='INSERT INTO direct_messages(author,recipient,body) VALUES(?,?,?)';
  s.run(insert,'demo_student','demo_teacher','Добрый день! Можно принести черновик решения на консультацию?');
  s.run(insert,'demo_teacher','demo_student','Да, конечно. Отметьте место, где возник вопрос, и разберём его вместе.');
 });
 function lessons(u){return s.all('SELECT l.*,p.name teacher_name FROM lessons l JOIN users p ON p.login=l.teacher '+(u.role==='dean'?'':u.role==='teacher'?'WHERE l.teacher=? ':'WHERE l.group_id=? ')+'ORDER BY l.day,l.start',...(u.role==='dean'?[]:[u.role==='teacher'?u.login:u.group_id]));}
 function requests(u){requireRole(u,'student','dean');return s.all('SELECT r.*,u.name FROM requests r JOIN users u ON u.login=r.student '+(u.role==='student'?'WHERE student=? ':'')+'ORDER BY r.id DESC',...(u.role==='student'?[u.login]:[]));}
 function grades(u){return s.all('SELECT g.*,u.name,u.group_id FROM grades g JOIN users u ON u.login=g.student '+(u.role==='student'?'WHERE student=?':u.role==='teacher'?'WHERE teacher=?':'')+' ORDER BY g.id',...(['student','teacher'].includes(u.role)?[u.login]:[]));}
 function appeals(u){return s.all('SELECT a.*,u.name FROM appeals a JOIN users u ON u.login=a.author '+(u.role==='dean'?'':'WHERE author=? ')+'ORDER BY a.id DESC',...(u.role==='dean'?[]:[u.login]));}
 function announcements(u){const query='SELECT a.*,p.name author_name FROM announcements a JOIN users p ON p.login=a.author ';return s.all(query+(u.role==='dean'?'':'WHERE audience IN (?,?,?) ')+'ORDER BY a.id DESC LIMIT 100',...(u.role==='dean'?[]:['all',u.role,u.group_id]));}
 function stats(){return {students:s.one("SELECT COUNT(*) n FROM users WHERE role='student'").n,teachers:s.one("SELECT COUNT(*) n FROM users WHERE role='teacher'").n,deans:s.one("SELECT COUNT(*) n FROM users WHERE role='dean'").n,debtors:s.one('SELECT COUNT(DISTINCT student) n FROM grades WHERE value=2').n,requests:s.all('SELECT status,COUNT(*) count FROM requests GROUP BY status'),appeals:s.one("SELECT COUNT(*) n FROM appeals WHERE status='Открыто'").n,groups:s.all("SELECT group_id,COUNT(*) count FROM users WHERE role='student' GROUP BY group_id")};}
 function context(u,message=''){
  const q=message.toLowerCase();const result={profile:publicUser(u),capabilities:(u.role==='dean'?deanCapabilities:u.role==='teacher'?teacherCapabilities:studentCapabilities).map(c=>({name:c.label,example:c.prompt})),note:'Только вымышленные учебные данные. Отсутствующие сведения не придумывай.'};
  if(/распис|занят|экзам|пар[уыа]/.test(q))result.schedule=lessons(u).slice(0,12);
  if(/заяв|справ|документ/.test(q)&&u.role!=='teacher')result.requests=requests(u).slice(0,8);
  if(/оцен|успеваем|задолж/.test(q))result.grades=grades(u).slice(0,12);
  if(/объяв/.test(q))result.announcements=announcements(u).slice(0,5);
  if(/обращ/.test(q))result.appeals=appeals(u).slice(0,5);
  if(u.role==='dean'&&/студент|сколько|статист|аналит|групп/.test(q))result.statistics=stats();
  return result;
 }
 function readAnswer(u,message){
  const query=message.toLowerCase().trim();
  if (/^(покажи |какие |назови )?(мои |у меня )?группы[?!. ]*$/.test(query)) {
   const groups=u.role==='student'?[u.group_id]:[...new Set(lessons(u).map(l=>l.group_id))];
   return {answer:'Учебные группы: '+groups.join(', '),source:'database'};
  }
  if (/^(найди|покажи|кто).*(преподавател|препода)/.test(query)) {
   const people=[...new Set(lessons(u).map(l=>l.teacher_name+' — '+l.subject))];
   return {answer:people.length?'Преподаватели в вашем расписании:':'В вашем расписании пока нет преподавателей.',items:people.map(title=>({title,body:''})),source:'database'};
  }
  if (/математик/.test(query)&&/сегодня|завтра/.test(query)) {
   const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date(Date.now()+(query.includes('завтра')?86400000:0)));
   const schedule=lessons(u).filter(l=>l.day===date&&/математик/i.test(l.subject));
   return {answer:schedule.length?'Да, математика в расписании на '+date+':':'На '+date+' математики в вашем расписании нет.',schedule,source:'database'};
  }
  if(u.role==='student' && /как.*(исправ|поднять|улучш)/.test(query) && /оцен|успеваем|балл/i.test(s.one("SELECT body FROM chats WHERE owner=? AND role='assistant' ORDER BY id DESC LIMIT 1",u.login)?.body||'')){
   const subjects=[...new Set(grades(u).filter(g=>g.value<=3).map(g=>g.subject))];
   return {answer:(subjects.length?'Начните с дисциплин: '+subjects.join(', ')+'. ':'')+'Уточните у преподавателя, какие работы можно пересдать и в какие сроки. Могу показать преподавателей или помочь написать личное сообщение.',actions:[{id:'agent-prompt',label:'Найти преподавателя',prompt:'Найди преподавателя'},{id:'agent-prompt',label:'Написать преподавателю',prompt:'Напиши преподавателю личное сообщение'}]};
  }

  if(typeof message!=='string'||message.length>2000||!message.trim())return null;
  // General study questions often mention exams or grades without asking for a database lookup.
  if (/^(?:как (?:мне |лучше )?(?:подготовиться|выучить|запомнить)|объясни (?:мне )?(?:разницу|понятие|почему)|дай (?:мне )?(?:совет|рекомендац)|помоги (?:мне )?подготовиться)/iu.test(message.trim())) return null;
  const followUp = /^а?\s*(?:на )?(сегодня|завтра|\d{4}-\d{2}-\d{2})[?!. ]*$/iu.exec(message.trim());
  if (followUp) {
   const previous = s.one("SELECT body FROM chats WHERE owner=? AND role='assistant' ORDER BY id DESC LIMIT 1",u.login)?.body || '';
   if (/расписани|учебные события|доступном вам расписании/i.test(previous)) {
    // A result may list multiple groups; inherit only an explicitly requested group.
    const explicitGroup = previous.split('\n')[0].match(/группы (ПИ-\d{2})/i)?.[1];
    message = 'Покажи расписание '+followUp[1]+(explicitGroup?' группы '+explicitGroup:'');
   }
  }
  const q=message.toLowerCase();
  if(!/общ.*чат|обращен|объявлен/.test(q)&&/напиш|написать|отправ|личн.*сообщ/.test(q)&&/преподав|декан|студент|сообщен|личк/.test(q))return {source:'workflow',answer:'Выберите получателя, затем продиктуйте или напишите текст. Перед отправкой я покажу личное сообщение целиком.',actions:[{id:'direct-compose',label:'Подготовить личное сообщение'}]};
  const read=path=>{const url=new URL(path,'http://localhost');return handle('GET',url.pathname,u,{},url);};
  const agent=(u.role==='dean'?createDeanAgent(s,read):createRoleAgent(read))(u,message);if(agent)return agent;
  const guide=(answer,actions,extra={})=>({answer,source:'workflow',actions,...extra});
  if(u.role==='dean'){
   if(/обращ/.test(q)&&/сдел|созда|оформ|напиш|отправ|подготов/.test(q))return guide('Помогу создать служебное обращение. Можем составить его прямо в чате: я уточню получателя, тему и текст. Или откройте обычную форму кнопкой ниже. Перед отправкой покажу предпросмотр. Без подтверждения ничего не отправляется.',[{id:'compose-staff',label:'Создать обращение здесь'}]);
   if(/экзам|распис|занят/.test(q)&&/перен|измен|назнач/.test(q))return guide('Выберите событие и нажмите «Изменить» под его карточкой. Покажу календарь и свободные интервалы. Запрос получит преподаватель; расписание изменится после его согласования.',[],{schedule:lessons(u).filter(l=>!q.includes('экзам')||l.kind==='Экзамен')});
   if(/заявлен|справк/.test(q))return guide('Заявления рассматриваются в «Документообороте». В карточке доступны текст, сведения студента, история и решение. Выберите заявку — подготовим изменение статуса.',[{id:'documents',label:'Открыть заявления'}],{requests:requests(u).slice(0,12)});
   if(/объявлен/.test(q))return guide('В «Коммуникациях» выберите аудиторию, тему и текст объявления. Затем проверьте предпросмотр и подтвердите публикацию.',[{id:'communications',label:'Подготовить объявление'}]);
   if(/аналит|статист/.test(q))return guide('Аналитика показывает студентов, задолженности, среднюю оценку и заявки. Доступны фильтры группы и курса; «Подробнее» выделяет нужную группу.',[{id:'analytics',label:'Открыть аналитику'}]);
   if(/студент/.test(q)&&/покаж|най|дело|смотр/.test(q))return guide('Откройте «Студенты», найдите человека по имени или группе и нажмите «Открыть дело». В карточке есть учебные данные, оценки, заявления и история.',[{id:'students',label:'Найти студента'}]);
   if(/помо|уме|умеш|привет|возможност|куда|как работ|что мож|подска|вкладк/.test(q))return guide('Я помогу найти сведения и подготовить действия. Выберите задачу ниже. Всё можно сделать вручную через вкладки слева. Действия с данными требуют вашего подтверждения.',[{id:'compose-staff',label:'Создать обращение'},{id:'schedule',label:'Изменить экзамен'},{id:'documents',label:'Рассмотреть заявление'},{id:'students',label:'Карточка студента'},{id:'analytics',label:'Проверить показатели'}]);
  }
  if(!/расписан|какие (?:пары|занятия)|мои (?:пары|занятия)/.test(q)||/перенес|измен|отмен|назнач/.test(q))return null;
  let date=q.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if(!date&&/сегодня|завтра|на день/.test(q))date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date(Date.now()+(q.includes('завтра')?86400000:0)));
  const group=q.match(/пи-\d{2}/i)?.[0].toUpperCase();
  const found=lessons(u).filter(l=>(!date||l.day===date)&&(!group||l.group_id===group));
  return {answer:found.length?`Вот расписание${date?' на '+date:''}${group?' группы '+group:''}. Данные из учебной базы.`:`${date?'На '+date:'По этому запросу'} занятий в доступном вам расписании нет. Можно попросить показать расписание без даты.`,source:'database',schedule:found.slice(0,30),total:found.length};
 }

 function handle(method,path,u,b,url){
  if(method==='GET'&&path==='/api/contacts')return {contacts:s.all('SELECT login,name,role,group_id,(SELECT MAX(id) FROM direct_messages WHERE (author=? AND recipient=p.login) OR (recipient=? AND author=p.login)) latest FROM users p WHERE login<>? ORDER BY latest DESC,name',u.login,u.login,u.login)};
  if(path==='/api/direct'&&['GET','POST'].includes(method)){
   const peer=method==='GET'?url.searchParams.get('peer'):b.recipient;
   if(typeof peer!=='string'||peer===u.login||!s.one('SELECT login FROM users WHERE login=?',peer))fail(400,'Выберите собеседника.');
   if(method==='GET')return {messages:s.all('SELECT m.*,p.name FROM direct_messages m JOIN users p ON p.login=m.author WHERE (author=? AND recipient=?) OR (author=? AND recipient=?) ORDER BY m.id DESC LIMIT 100',u.login,peer,peer,u.login).reverse()};
   confirmed(b);const body=text(b.body,1000);
   return s.transaction(()=>{const id=Number(s.run('INSERT INTO direct_messages(author,recipient,body) VALUES(?,?,?)',u.login,peer,body).lastInsertRowid);s.notify(peer,'Личное сообщение от '+u.name+'. Откройте чат.');return {id};});
  }
  if(method==='GET'&&path==='/api/portal')return portalFeed(s,u);
  const deanResult=deanRoutes(method,path,u,b,url);if(deanResult!==undefined)return deanResult;
  if(method==='GET'&&path==='/api/workspace')return {user:publicUser(u),groups:[...new Set(lessons(u).map(l=>l.group_id))],persistent:true};
  if(method==='GET'&&path==='/api/students'){
   requireRole(u,'dean','teacher');const rows=u.role==='dean'?s.all("SELECT login,name,group_id,course FROM users WHERE role='student' ORDER BY name"):s.all("SELECT login,name,group_id,course FROM users WHERE role='student' AND group_id IN (SELECT group_id FROM lessons WHERE teacher=?) ORDER BY name",u.login);
   const q=(url.searchParams.get('q')||'').toLowerCase(),course=url.searchParams.get('course');return {students:rows.filter(r=>(!course||String(r.course)===course)&&[r.name,r.group_id].join(' ').toLowerCase().includes(q))};
  }
  if(method==='GET'&&path==='/api/lessons')return {lessons:lessons(u)};
  if(method==='POST'&&/^\/api\/lessons\/\d+$/.test(path)){
   requireRole(u,'dean');confirmed(b);const lessonId=id(path.split('/').pop());
   return s.transaction(()=>{const old=s.one('SELECT * FROM lessons WHERE id=?',lessonId);version(old,b);
    const day=text(b.day,10),start=text(b.start,5),end=text(b.end,5),room=text(b.room,30),kind=text(b.kind,30);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end||!['Занятие','Экзамен','Зачёт'].includes(kind))fail(400,'Проверьте дату, время и тип события.');
    const conflict=s.one('SELECT id FROM lessons WHERE id<>? AND day=? AND start<? AND end>? AND (room=? OR teacher=? OR group_id=?)',lessonId,day,end,start,room,old.teacher,old.group_id);if(conflict)fail(409,'Конфликт расписания: заняты группа, преподаватель или аудитория.');
    s.run('UPDATE lessons SET day=?,start=?,end=?,room=?,kind=?,version=version+1 WHERE id=?',day,start,end,room,kind,lessonId);const next=s.one('SELECT * FROM lessons WHERE id=?',lessonId);s.audit(u.login,'update','lesson',lessonId,old,next);
    for(const recipient of s.all("SELECT login FROM users WHERE group_id=? OR login=?",old.group_id,old.teacher))s.notify(recipient.login,`${old.subject}: ${day}, ${start}–${end}, аудитория ${room}.`);return {lesson:next};
   });
  }
  if(method==='GET'&&path==='/api/requests')return {requests:requests(u)};
  if(method==='POST'&&path==='/api/requests'){requireRole(u,'student');const kind=text(b.kind,100),body=text(b.body);if(!['Справка об обучении','Заявление в деканат'].includes(kind))fail(400,'Неизвестный тип документа.');return s.transaction(()=>{const result=s.run('INSERT INTO requests(student,kind,body) VALUES(?,?,?)',u.login,kind,body);const n=Number(result.lastInsertRowid);s.audit(u.login,'create','request',n,{}, {kind});for(const d of s.all("SELECT login FROM users WHERE role='dean'"))s.notify(d.login,`Новая заявка №${n}: ${kind}`);return {request:s.one('SELECT * FROM requests WHERE id=?',n)};});}
  if(method==='POST'&&/^\/api\/requests\/\d+$/.test(path)){requireRole(u,'dean');confirmed(b);return s.transaction(()=>{const n=id(path.split('/').pop()),old=s.one('SELECT * FROM requests WHERE id=?',n);version(old,b);const transitions={'Новая':['На рассмотрении'],'На рассмотрении':['Требуется уточнение','Одобрена','Отклонена'],'Требуется уточнение':['На рассмотрении'],'Одобрена':['Готова'],'Отклонена':[],'Готова':[]};if(!transitions[old.status].includes(b.status))fail(409,'Этот переход статуса недоступен.');const comment=typeof b.comment==='string'?b.comment.trim():'';if(comment.length>2000||(['Отклонена','Требуется уточнение'].includes(b.status)&&!comment))fail(400,'Укажите причину решения.');s.run('UPDATE requests SET status=?,comment=?,version=version+1 WHERE id=?',b.status,comment,n);const next=s.one('SELECT * FROM requests WHERE id=?',n);s.audit(u.login,'status','request',n,old,next);s.notify(old.student,`Заявка №${n}: ${b.status}. ${comment}`);return {request:next};});}
  if(method==='POST'&&/^\/api\/requests\/\d+\/clarification$/.test(path)){requireRole(u,'student');confirmed(b);return s.transaction(()=>{const n=id(path.split('/')[3]),old=s.one('SELECT * FROM requests WHERE id=?',n);if(!old||old.student!==u.login)fail(403,'Нет доступа к заявлению.');version(old,b);if(old.status!=='Требуется уточнение')fail(409,'Заявление сейчас не ожидает уточнения.');const clarification=text(b.body);s.run('INSERT INTO request_clarifications(request_id,student,body) VALUES(?,?,?)',n,u.login,clarification);s.run("UPDATE requests SET status='На рассмотрении',version=version+1 WHERE id=?",n);s.audit(u.login,'clarification','request',n,old,{status:'На рассмотрении',body:clarification});for(const d of s.all("SELECT login FROM users WHERE role='dean'"))s.notify(d.login,`Уточнение к заявлению №${n}. Проверьте дополнение студента.`);return {id:n,status:'На рассмотрении'};});}
  if(method==='GET'&&path==='/api/grades')return {grades:grades(u)};
  if(method==='POST'&&/^\/api\/grades\/\d+$/.test(path)){requireRole(u,'teacher');confirmed(b);return s.transaction(()=>{const n=id(path.split('/').pop()),old=s.one('SELECT * FROM grades WHERE id=?',n);if(!old||old.teacher!==u.login)fail(403,'Вы не ведёте эту дисциплину у студента.');version(old,b);if(!Number.isInteger(b.value)||b.value<2||b.value>5)fail(400,'Оценка должна быть от 2 до 5.');const reason=text(b.reason,500);s.run('UPDATE grades SET value=?,version=version+1 WHERE id=?',b.value,n);s.audit(u.login,'grade','grade',n,old,{...old,value:b.value,reason});s.notify(old.student,`${old.subject}: оценка ${b.value}. ${reason}`);return {ok:true};});}
  if(method==='GET'&&path==='/api/announcements')return {announcements:announcements(u)};
  if(method==='POST'&&path==='/api/announcements'){requireRole(u,'dean');confirmed(b);const audience=text(b.audience,30),subject=text(b.subject,120),body=text(b.body);if(!['all','student','teacher',...s.all("SELECT DISTINCT group_id FROM users WHERE role='student'").map(x=>x.group_id)].includes(audience))fail(400,'Неизвестная аудитория.');return s.transaction(()=>{const n=Number(s.run('INSERT INTO announcements(author,audience,subject,body) VALUES(?,?,?,?)',u.login,audience,subject,body).lastInsertRowid);for(const recipient of s.all("SELECT login FROM users WHERE ?='all' OR role=? OR group_id=?",audience,audience,audience))s.notify(recipient.login,`Объявление: ${subject}`);s.audit(u.login,'publish','announcement',n,{}, {audience,subject,body});return {id:n};});}
  if(method==='GET'&&path==='/api/appeals')return {appeals:appeals(u)};
  if(method==='POST'&&path==='/api/appeals'){requireRole(u,'student','teacher');const subject=text(b.subject,120),body=text(b.body);return s.transaction(()=>{const n=Number(s.run('INSERT INTO appeals(author,subject,body) VALUES(?,?,?)',u.login,subject,body).lastInsertRowid);s.audit(u.login,'create','appeal',n,{}, {subject,body});for(const d of s.all("SELECT login FROM users WHERE role='dean'"))s.notify(d.login,`Новое обращение №${n}: ${subject}`);return {id:n};});}
  if(method==='POST'&&/^\/api\/appeals\/\d+$/.test(path)){requireRole(u,'dean');confirmed(b);return s.transaction(()=>{const n=id(path.split('/').pop()),old=s.one('SELECT * FROM appeals WHERE id=?',n);version(old,b);if(old.status!=='Открыто')fail(409,'Обращение уже закрыто.');const reply=text(b.reply);s.run("UPDATE appeals SET reply=?,status='Закрыто',version=version+1 WHERE id=?",reply,n);s.audit(u.login,'reply','appeal',n,old,{reply});s.notify(old.author,`Ответ на обращение №${n}: ${reply}`);return {ok:true};});}
  if(method==='GET'&&path==='/api/notifications')return {notifications:s.all('SELECT * FROM notifications WHERE recipient=? ORDER BY id DESC LIMIT 100',u.login)};
  if(method==='POST'&&path==='/api/notifications/read'){s.run('UPDATE notifications SET read=1 WHERE recipient=? AND id=?',u.login,id(b.id));return {ok:true};}
  if(method==='GET'&&path==='/api/messages')return {messages:s.all('SELECT m.*,u.name FROM messages m JOIN users u ON u.login=m.author ORDER BY id DESC LIMIT 100').reverse()};
  if(method==='POST'&&path==='/api/messages'){const n=Number(s.run('INSERT INTO messages(author,body) VALUES(?,?)',u.login,text(b.body,1000)).lastInsertRowid);return {id:n};}
  if(method==='GET'&&path==='/api/stats'){requireRole(u,'dean');return stats();}
  if(method==='GET'&&path==='/api/audit'){requireRole(u,'dean');return {history:s.all('SELECT * FROM audit ORDER BY id DESC LIMIT 100')};}
  return undefined;
 }
 return {handle,context,readAnswer};
}
