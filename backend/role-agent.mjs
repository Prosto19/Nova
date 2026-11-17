// Student and teacher chat tools use the same scoped reads as their manual tabs.
const capability=(key,label,prompt)=>({id:'agent-prompt',key,label,prompt});
const shared=[capability('schedule','Моё расписание','Покажи расписание'),capability('exams','Экзамены и зачёты','Покажи экзамены'),capability('appeal','Обращение в деканат','Создать обращение'),capability('inbox','Мои обращения и ответы','Покажи мои обращения'),capability('announcements','Объявления','Покажи объявления'),capability('notifications','Уведомления','Покажи уведомления'),capability('community','Общий чат','Покажи общий чат'),capability('profile','Мой профиль','Покажи мой профиль')];
export const studentCapabilities=[...shared.slice(0,2),capability('grades','Моя успеваемость','Покажи мои оценки'),capability('debts','Мои задолженности','Покажи задолженности'),capability('request','Заказать справку / подать заявление','Подать заявление'),capability('requests','Статусы моих заявлений','Покажи мои заявления'),...shared.slice(2)];
export const teacherCapabilities=[...shared.slice(0,2),capability('changes','Согласование переносов','Покажи запросы на перенос'),capability('grades','Мои ведомости','Покажи ведомости'),capability('edit-grade','Исправить оценку','Изменить оценку'),capability('students','Студенты моих групп','Найди студентов'),...shared.slice(2)];
const result=(answer,extra={})=>({answer,source:'workflow',actions:[],...extra});
const item=(title,body,action)=>({title,body,actions:action?[action]:[]});
const rows=(answer,items)=>result(items.length?answer:'По запросу ничего не найдено. Уточните запрос или откройте список без фильтра.',{source:'database',items:items.slice(0,30),total:items.length});
export function createRoleAgent(read){return (u,message)=>{
 if(!['student','teacher'].includes(u.role)||typeof message!=='string'||!message.trim()||message.length>2000)return null;
 const q=message.toLowerCase().replaceAll('ё','е').trim(),teacher=u.role==='teacher';
 const available=[{id:'agent-prompt',label:'Мои возможности',prompt:'Что ты умеешь?'}];
 const denied=answer=>result(answer+' Ничего не изменено.',{code:'permission_denied',actions:available});
 const unavailable=answer=>result(answer+' Эта функция пока недоступна. Ничего не изменено.',{code:'unsupported_action',actions:available});
 if(/удал|отчисл|зачисл|оплат|стипенди|зарплат|договор|абитуриент|выгруз|экспорт|скача|pdf|excel|email|почт|телеграм|telegram|смс|sms|сброс.*парол|созда.*аккаунт|выдай.*диплом/.test(q))return unavailable('Соответствующее действие или интеграция не подключены.');
 if(/чуж|другого студента|всех студентов|всех групп/.test(q)&&/оцен|заяв|профил|данн|студент|распис/.test(q))return denied(teacher?'Доступны только ваши дисциплины и связанные учебные группы.':'Доступны только ваши личные данные и расписание вашей группы.');
 if(/аналит|аудит|истори.*измен|статист.*факультет/.test(q))return denied('Этот раздел доступен сотрудникам деканата.');
 if(/(?:созда|опубли|отправ|напиш).*(?:объявлен)/.test(q))return denied('Публиковать официальные объявления может деканат. Вы можете написать обращение или сообщение в общий чат.');
 if(!teacher&&/(?:измен|исправ|постав|выстав|повыс).*(?:оцен|балл)/.test(q))return denied('Студент не может изменять оценки. Обратитесь к преподавателю или составьте обращение в деканат.');
 if(/(?:созда|добав|отмен|назнач|запланир).*(?:экзам|занят|событи|зачет)/.test(q))return unavailable('Создание и отмена учебных событий не подключены.');
 if(/что.*(?:уме|умеш|мож)|возможност|функци|помощь|^привет[.!? ]*$/.test(q))return result(teacher?'Я помогу с вашим расписанием, согласованием переносов, ведомостями и обращениями. Выберите задачу. Изменения — только после проверки и подтверждения.':'Я помогу с расписанием, оценками, справками и обращениями. Выберите задачу — сведения появятся в чате. Заявления и обращения отправляются после вашего подтверждения.',{actions:teacher?teacherCapabilities:studentCapabilities});
 if(/^(отмена|отменить|стоп)[.! ]*$/.test(q))return result('Активного черновика нет. Ничего не изменено.');
 if(/профил|мои данные/.test(q)){const {user}=read('/api/workspace');return result('Ваш профиль из учебной базы.',{source:'database',items:[item(user.name,user.role+(user.group?' · '+user.group:'')+'\nЛогин: '+user.login)],actions:!teacher?[{id:'student-detail',label:'Моя учебная карточка',login:u.login}]:[]});}
 if(/уведомлен/.test(q))return rows('Ваши уведомления:',read('/api/notifications').notifications.map(n=>item(n.read?'Прочитано':'Новое',n.message,n.read?null:{id:'notification-read',label:'Отметить прочитанным',recordId:n.id})));
 if(/общ.*чат/.test(q))return result('Общий чат учебного стенда: сообщения видны всем участникам.',{items:read('/api/messages').messages.slice(-30).map(m=>item(m.name+' · '+m.created,m.body)),actions:[{id:'community-compose',label:'Написать сообщение'}]});
 if(/объявлен/.test(q))return rows('Объявления для вас:',read('/api/announcements').announcements.map(a=>item(a.subject,a.body)));
 if(/обращ/.test(q)){
  if(/созда|сдел|оформ|напиш|отправ|подготов|подать/.test(q))return result('Подготовим обращение в деканат. Уточню тему и текст, затем покажу предпросмотр.',{actions:[{id:'appeal-compose',label:'Написать обращение в деканат'}]});
  const number=q.match(/(?:№|номер|обращени[еяю])\s*(\d+)/)?.[1];
  const own=read('/api/appeals').appeals.filter(a=>!number||a.id===Number(number)).map(a=>item('№'+a.id+' · '+a.subject,a.status+'\n'+a.body+(a.reply?'\nОтвет деканата: '+a.reply:'')));
  const staff=teacher?read('/api/staff-requests').requests.filter(a=>!number||a.id===Number(number)).map(a=>item('Служебное №'+a.id+' · '+a.subject,a.author_name+' → '+a.recipient_name+' · '+a.status+'\n'+a.body+(a.reply?'\nОтвет: '+a.reply:''),a.recipient===u.login&&a.status==='Открыто'?{id:'staff-reply',label:'Ответить сотруднику',recordId:a.id}:null)):[];
  return rows('Ваши обращения и ответы:',[...own,...staff]);
 }
 if(/заявлен|справк/.test(q)){
  if(teacher)return denied('Студенческие заявления доступны студенту-владельцу и деканату. Для своего вопроса используйте обращение в деканат.');
  if(/подать|подай|созда|оформ|закаж|заказ|получить|нужна|сдел/.test(q))return result('Подготовим заявку. Выберите документ, опишите назначение и подтвердите отправку. Готовность зависит от решения деканата; PDF пока не формируется.',{actions:[{id:'request-compose',label:'Подготовить заявку',kind:/справк/.test(q)?'Справка об обучении':undefined}]});
  const number=q.match(/(?:№|номер|заявлени[еяю])\s*(\d+)/)?.[1];const requests=read('/api/requests').requests.filter(r=>!number||r.id===Number(number));return result(requests.length?'Ваши заявления. В карточке доступны текст, решение и история.':'У вас нет заявления с таким номером.',{source:'database',requests,actions:[{id:'request-compose',label:'Новая заявка'}]});
 }
 const group=q.match(/пи-\d{2}/)?.[0].toUpperCase();
 if(teacher&&/перенос|согласован|согласуй|одобри.*перен|отклони.*перен/.test(q))return rows('Запросы на перенос ваших событий. Проверьте дату и подтвердите решение.',read('/api/lesson-changes').changes.map(c=>item('№'+c.id+' · '+c.subject,c.group_id+' · '+c.status+'\n'+c.payload.day+' '+c.payload.start+'–'+c.payload.end+' · аудитория '+c.payload.room+(c.comment?'\n'+c.comment:''),c.status==='Ожидает ответа'?{id:'lesson-decision',label:'Рассмотреть перенос',recordId:c.id}:null)));
 if(/(?:измен|перен|исправ).*(?:распис|экзам|занят)/.test(q))return denied('Перенос инициирует деканат. '+(teacher?'Вы можете согласовать адресованный вам запрос.':'Напишите обращение в деканат.'));
 if(/оцен|успеваем|задолж|ведомост|балл/.test(q)){
  let grades=read('/api/grades').grades.filter(g=>!group||g.group_id===group);if(/задолж/.test(q))grades=grades.filter(g=>g.value===2);
  return rows(teacher?'Ведомости ваших дисциплин. Для изменения выберите запись, укажите оценку и причину.':'Ваши оценки из учебной базы.',grades.map(g=>item((teacher?g.name+' · '+g.group_id+' · ':'')+g.subject,'Оценка: '+g.value+(g.value===2?' · задолженность':''),teacher?{id:'grade-edit',label:'Исправить оценку',recordId:g.id}:null)));
 }
 if(teacher&&/студент/.test(q)&&/най|покаж|карточ|дело|поиск/.test(q)){
  const search=q.replace(/(?:покажи|показать|найди|найти|поиск|карточку|карточка|дело|студентов|студента|студент|моих|мои|группы|группа|из)\s*/g,'').replace(/[«»"?.!]/g,'').trim();return rows('Студенты ваших учебных групп:',read('/api/students?q='+encodeURIComponent(search)).students.map(p=>item(p.name,p.group_id+' · '+p.course+' курс',{id:'student-detail',label:'Открыть учебную карточку',login:p.login})));
 }
 if(/распис|экзам|зачет|какие.*пар|какие.*занят|мои пары|мой учебный день/.test(q)){
  let date=q.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];if(date&&(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))return result('Дата некорректна. Укажите её в формате ГГГГ-ММ-ДД.',{code:'invalid_input'});
  if(!date&&/сегодня|завтра|на день/.test(q))date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date(Date.now()+(q.includes('завтра')?86400000:0)));
  const schedule=read('/api/lessons').lessons.filter(l=>(!date||l.day===date)&&(!group||l.group_id===group)&&(!/экзам|зачет/.test(q)||l.kind!=='Занятие'));
  return result(schedule.length?'Ваши учебные события'+(date?' на '+date:'')+'.':'В доступном вам расписании событий по этому запросу нет.',{source:'database',schedule,total:schedule.length});
 }
 if(/^(сделай|создай|добавь|отправь|измени|назначь|запусти|сформируй|выполни|подключи|забронируй)/.test(q))return unavailable('Не удалось определить поддерживаемое действие.');
 return null;
};}
