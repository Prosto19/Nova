export function seedPortal(s) {
 s.db.exec('CREATE TABLE IF NOT EXISTS demo_updates(name TEXT PRIMARY KEY)');
 s.transaction(()=>{
  if(!s.run("INSERT OR IGNORE INTO demo_updates VALUES('campus-conversations-calendar')").changes)return;
  const message=(who,body)=>s.run('INSERT INTO messages(author,body) VALUES(?,?)',who,body);
  message('demo_student','Подскажите, к консультации по математике подготовить задачи из третьего листка?');
  message('demo_teacher','Да, разберём задачи 2 и 4. Если решение не получилось, принесите черновик.');
  message('demo_student2','Спасибо! Тогда принесу оба варианта решения.');
  s.run('INSERT INTO appeals(author,subject,body) VALUES(?,?,?)','demo_student','Помощь со справкой','Добрый день! Для общежития нужна справка об обучении. Подскажите, где забрать готовый документ?');
  s.notify('demo_dean','Новое обращение студента «Помощь со справкой». Откройте раздел «Коммуникации».');
  // Each group keeps its original teacher and room. Stagger shared teachers across days.
  const groups=s.all('SELECT group_id,teacher,room FROM lessons GROUP BY group_id ORDER BY group_id');
  for(const [i,g] of groups.entries())for(const base of [14,21])for(const offset of [0,2]){
   const day='2026-12-'+(base+Math.floor(i/6)+offset);
   for(const [subject,start,end] of [['Программирование','09:00','10:30'],['Математика','11:00','12:30']]){
    s.run('INSERT INTO lessons(subject,group_id,teacher,day,start,end,room,kind) VALUES(?,?,?,?,?,?,?,?)',subject,g.group_id,g.teacher,day,start,end,g.room,'Занятие');
   }
  }
 });
 s.db.exec('CREATE TABLE IF NOT EXISTS portal_examples(kind TEXT, record_id INTEGER, PRIMARY KEY(kind,record_id))');
 s.transaction(() => {
  if (s.one('SELECT 1 FROM portal_examples LIMIT 1')) return;
  function example(kind, sql, ...params) {
   const id = Number(s.run(sql,...params).lastInsertRowid);
   s.run('INSERT INTO portal_examples VALUES(?,?)',kind,id);
   return id;
  }
  const announce = "INSERT INTO announcements(author,audience,subject,body,created) VALUES(?,?,?,?,datetime('now',?))";
  example('announcement',announce,'demo_dean','all','Открыта запись на консультации','Вопросы к консультации можно заранее направить преподавателю через деканат.','-85 minutes');
  example('announcement',announce,'dean002','ПИ-01','ПИ-01 · подготовка к сессии','Проверьте даты экзаменов в расписании группы. Если заметите совпадение, напишите в деканат.','-22 minutes');
  const appeal = example('appeal',"INSERT INTO appeals(author,subject,body,created) VALUES(?,?,?,datetime('now','-54 minutes'))",'demo_teacher','Аудитория для консультации','Можно провести консультацию по математике для ПИ-01 в аудитории 301?');
  const reply = 'Аудитория 301 доступна. Сообщите группе время консультации.';
  s.run("UPDATE appeals SET status='Закрыто',reply=?,version=version+1 WHERE id=?",reply,appeal);
  example('reply',"INSERT INTO audit(actor,action,entity,entity_id,before_json,after_json,created) VALUES('demo_dean','reply','appeal',?,'{}',?,datetime('now','-36 minutes'))",appeal,JSON.stringify({reply}));
  example('message',"INSERT INTO messages(author,body,created) VALUES(?,?,datetime('now','-12 minutes'))",'demo_student','Нашёл расписание экзаменов в NOVA. Спасибо за объявление!');
 });
}

export function portalFeed(s,user) {
 const events=s.all(`WITH events(kind,id,actor,created,title,body) AS (
  SELECT 'announcement',id,author,created,subject,body FROM announcements WHERE ?='dean' OR audience IN ('all',?,?)
  UNION ALL SELECT 'appeal',id,author,created,subject,body FROM appeals WHERE ?='dean' OR author=?
  UNION ALL SELECT 'reply',a.id,a.actor,a.created,r.subject,json_extract(a.after_json,'$.reply') FROM audit a JOIN appeals r ON r.id=a.entity_id WHERE a.entity='appeal' AND a.action='reply' AND (?='dean' OR r.author=?)
  UNION ALL SELECT 'message',id,author,created,'Общий чат',body FROM messages
 ) SELECT events.*,u.name, e.record_id IS NOT NULL AS demo FROM events JOIN users u ON u.login=actor LEFT JOIN portal_examples e ON e.kind=events.kind AND e.record_id=events.id ORDER BY created DESC, id DESC, kind LIMIT 12`,user.role,user.role,user.group_id,user.role,user.login,user.role,user.login);
 return {events};
}
