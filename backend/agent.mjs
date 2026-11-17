// Explicit, read-only intent routing. Mutations stay behind existing authorized APIs.
export const deanCapabilities = [
 ['schedule','Расписание и экзамены','Покажи расписание'],
 ['move','Перенос события на согласование','Изменить экзамен'],
 ['changes','Статусы переносов','Покажи статусы переносов'],
 ['requests','Рассмотрение заявлений','Покажи заявления'],
 ['students','Поиск и карточки студентов','Найди студентов'],
 ['grades','Оценки и задолженности','Покажи задолженности'],
 ['staff','Служебные обращения','Создать обращение'],
 ['inbox','Входящие обращения и ответы','Покажи обращения'],
 ['announcements','Объявления и публикация','Создать объявление'],
 ['analytics','Показатели деканата','Покажи аналитику'],
 ['notifications','Личные уведомления','Покажи уведомления'],
 ['community','Общий чат','Покажи общий чат'],
 ['audit','История изменений','Покажи историю изменений']
].map(([id,label,prompt])=>({id:'agent-prompt',key:id,label,prompt}));
const response=(answer,extra={})=>({answer,source:'workflow',actions:[],...extra});
export function createDeanAgent(s,read){
 return function(u,message){
  if(u.role!=='dean'||typeof message!=='string'||!message.trim()||message.length>2000)return null;
  const q=message.toLowerCase().replaceAll('ё','е').trim();
  const unsupported=(reason)=>response(reason+' Эта функция пока недоступна. Ничего не изменено. Могу показать доступные действия.',{code:'unsupported_action',actions:[{id:'agent-prompt',label:'Все возможности',prompt:'Что ты умеешь?'}]});
  // Check unavailable operations BEFORE matching a noun such as "студент" or "экзамен".
  if(/удал|отчисл|зачисл|восстанови.*студент|переведи.*студент|перевести.*студент|оплат|стипенди|зарплат|договор|приемн.*кампан|абитуриент|выгруз|экспорт|скача|pdf|excel|почт|email|telegram|телеграм|sms|смс|подпис.*документ|сброс.*парол|созда.*аккаунт|(?:сформир|сгенерир|выдай|выдать).*(?:справк|приказ|диплом)/.test(q))return unsupported('Не могу выполнить этот запрос: соответствующее действие или интеграция не подключены.');
  if(/(?:измен|постав|исправ|выстав|повыс|удал).*(?:оцен|балл)/.test(q))return response('В роли деканата можно просматривать оценки. Изменение доступно только преподавателю своей дисциплины с указанием причины. Я не меняла оценки.',{code:'permission_denied',actions:[{id:'agent-prompt',label:'Посмотреть оценки',prompt:'Покажи оценки'}]});
  if(/(?:созда|добав|отмен|удал|запланир).*(?:экзам|занят|событи|зачет)/.test(q))return unsupported('Сейчас поддерживается перенос существующего события с согласованием преподавателя. Создание и отмена событий ещё не подключены.');
  if(/^(?:отмена|отменить|стоп)[.! ]*$/.test(q))return response('Активного черновика нет. Ничего не изменено.');
  if(/что.*(?:уме|умеш|мож)|возможност|функци|помощь|^помоги[.!? ]*$|^привет[.!? ]*$|как работ/.test(q))return response('Я помогу найти сведения и подготовить действия. Выберите задачу ниже — результат появится в чате. Обращения, объявления и сообщения можно составить диалогом. Для переноса экзамена и решения по заявлению открою карточку с проверкой и подтверждением. Доступно также ручное управление через вкладки слева.',{actions:deanCapabilities});
  const group=q.match(/пи-\d{2}/)?.[0].toUpperCase();
  const rows=(answer,items)=>response(items.length?answer:'По запросу ничего не найдено. Уточните фильтр или откройте список без фильтра.',{source:'database',items:items.slice(0,30),total:items.length});
  const item=(title,body,action)=>({title,body,actions:action?[action]:[]});
  if(/статус.*перенос|перенос.*статус|согласован|запрос.*перенос/.test(q)){const r=read('/api/lesson-changes').changes;return rows('Статусы запросов на перенос:',r.map(c=>item('№'+c.id+' · '+c.subject,c.group_id+' · '+c.status+' · '+c.payload.day+' '+c.payload.start+' · '+c.teacher_name+(c.comment?' · '+c.comment:''))));}
  if(/истори.*измен|аудит|журнал.*действ/.test(q))return rows('Последние изменения в учебной базе:',read('/api/audit').history.map(h=>item(h.created+' · '+h.action,h.entity+' №'+h.entity_id+' · '+h.actor)));
  if(/уведомлен/.test(q))return rows('Ваши уведомления:',read('/api/notifications').notifications.map(n=>item(n.read?'Прочитано':'Новое',n.message,n.read?null:{id:'notification-read',label:'Отметить прочитанным',recordId:n.id})));
  if(/общ.*чат/.test(q)){
   if(/напиш|отправ|созда|подготов/.test(q))return response('Помогу подготовить сообщение в общий чат. Перед отправкой покажу текст для подтверждения.',{actions:[{id:'community-compose',label:'Написать сообщение'}]});
   const messages=read('/api/messages').messages.slice(-30);return response(messages.length?'Общий чат. Сообщения доступны всем участникам учебного стенда.':'В общем чате пока нет сообщений.',{items:messages.map(m=>item(m.name+' · '+m.created,m.body)),actions:[{id:'community-compose',label:'Написать сообщение'}]});
  }
  if(/объявлен/.test(q)){
   if(/созда|напиш|опубли|отправ|подготов|сдел/.test(q))return response('Подготовим объявление в чате: выберем аудиторию, тему и текст. Публикация — только после вашего подтверждения.',{actions:[{id:'announcement-compose',label:'Составить объявление'}]});
   return rows('Объявления:',read('/api/announcements').announcements.map(a=>item(a.subject,'Аудитория: '+a.audience+'\n'+a.body)));
  }
  if(/обращ/.test(q)&&!/созда|сдел|оформ|напиш|отправ|подготов/.test(q)){
   const number=q.match(/(?:№|номер|обращени[еяю])\s*(\d+)/)?.[1];
   const regular=read('/api/appeals').appeals.filter(a=>!number||a.id===Number(number)).map(a=>item('Обращение №'+a.id+' · '+a.subject,a.name+' · '+a.status+'\n'+a.body+(a.reply?'\nОтвет: '+a.reply:''),a.status==='Открыто'?{id:'appeal-reply',label:'Подготовить ответ',recordId:a.id}:null));
   const staff=read('/api/staff-requests').requests.filter(a=>!number||a.id===Number(number)).map(a=>item('Служебное №'+a.id+' · '+a.subject,a.author_name+' → '+a.recipient_name+' · '+a.status+'\n'+a.body+(a.reply?'\nОтвет: '+a.reply:''),a.recipient===u.login&&a.status==='Открыто'?{id:'staff-reply',label:'Ответить сотруднику',recordId:a.id}:null));
   return rows('Обращения, доступные вам. Выберите нужное для ответа:',[...regular,...staff]);
  }
  if(/аналит|статист|сколько.*студент/.test(q)){
   const a=read('/api/dean/analytics'+(group?'?group='+encodeURIComponent(group):''));return response('Показатели'+(group?' группы '+group:' деканата')+' из учебной базы.',{source:'database',items:[item('Студенты',String(a.students)),item('Студенты с задолженностями',String(a.debtors)),item('Средняя оценка',a.average===null?'Нет оценок':String(a.average)),item('Заявления',a.requests+' всего · '+a.openRequests+' в работе'),...a.groups.map(g=>item(g.group,g.students+' студентов · '+g.debtors+' с задолженностями'))],actions:[{id:'analytics',label:'Открыть подробную аналитику'}]});
  }
  if(/оцен|успеваем|задолж|должник/.test(q)){let gs=read('/api/grades').grades.filter(g=>!group||g.group_id===group);if(/задолж|должник/.test(q))gs=gs.filter(g=>g.value===2);return rows('Оценки из базы'+(group?' · '+group:'')+'. Показано до 30 записей.',gs.map(g=>item(g.name+' · '+g.group_id,g.subject+' · оценка '+g.value,{id:'student-detail',label:'Карточка студента',login:g.student})));}
  if(/студент/.test(q)&&/най|покаж|поиск|карточ|дело|смотр/.test(q)){
   const search=q.replace(/(?:покажи|показать|найди|найти|поиск|карточку|карточка|дело|посмотреть|студентов|студента|студент|группы|группу|группа|для|из)\s*/g,'').replace(/[«»"?.!]/g,'').trim();
   return rows('Найденные студенты. Показано до 30 записей; уточните имя или группу.',read('/api/students?q='+encodeURIComponent(search)).students.map(p=>item(p.name,p.group_id+' · '+p.course+' курс',{id:'student-detail',label:'Открыть дело',login:p.login})));
  }
  if(/заявлен|справк/.test(q)){
   const number=q.match(/(?:№|номер|заявлени[еяю])\s*(\d+)/)?.[1];let rs=read('/api/requests').requests;if(number)rs=rs.filter(r=>r.id===Number(number));if(/новые|новых/.test(q))rs=rs.filter(r=>r.status==='Новая');return response(rs.length?'Заявления из учебной базы. Откройте карточку, проверьте сведения и подтвердите решение.':'Заявление не найдено. Проверьте номер или запросите список без фильтра.',{source:'database',requests:rs.slice(0,30),total:rs.length,actions:[]});
  }
  if(/распис|экзам|занят/.test(q)&&/покаж|посмотр|каки|перен|измен|назнач/.test(q))return null;
  if(/обращ/.test(q)&&/созда|сдел|оформ|напиш|отправ|подготов/.test(q))return null; // existing validated workflows
  if(/^(?:сделай|создай|добавь|отправь|измени|назначь|запусти|открой|сформируй|выполни|подключи|забронируй|удали|сделать|создать|добавить|отправить|изменить|выполнить|можешь .*|можно ли .*)/.test(q))return unsupported('Я не распознала поддерживаемое действие для этого запроса.');
  return null; // consultation only; the LLM has no write tools
 };
}
