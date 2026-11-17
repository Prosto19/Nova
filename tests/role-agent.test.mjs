import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'nova-role-agent-'));process.env.NOVA_DATA_DIR=dir;
const {server,store}=await import('../server.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
async function call(path,cookie='',body){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const login=async name=>(await call('/api/login','',{login:name,password:'Nova2026!'})).cookie;
const ask=async(cookie,message)=>{const r=await call('/api/chat',cookie,{message});assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(['workflow','database'].includes(r.body.source),message);return r.body;};
test('student and teacher catalogs use scoped database actions and deny unavailable operations',async()=>{
 const student=await login('demo_student'),teacher=await login('demo_teacher');
 for(const [cookie,count] of [[student,12],[teacher,12]]){const catalog=await ask(cookie,'Что ты умеешь?');assert.equal(catalog.actions.length,count);for(const c of catalog.actions)await ask(cookie,c.prompt);assert.equal((await ask(cookie,'Отправь расписание в Telegram')).code,'unsupported_action');assert.equal((await ask(cookie,'Создай объявление')).code,'permission_denied');}
 assert.equal((await ask(student,'Поставь оценку 5')).code,'permission_denied');assert.equal((await ask(student,'Покажи оценки другого студента')).code,'permission_denied');
 assert.equal((await ask(student,'Покажи мои оценки')).items.length,2);assert.equal((await ask(student,'Покажи расписание группы ПИ-02')).schedule.length,0);
 assert.ok((await ask(teacher,'Покажи ведомости')).items.every(i=>i.actions[0].id==='grade-edit'));
 assert.equal((await ask(teacher,'Покажи заявления')).code,'permission_denied');assert.equal((await ask(student,'Покажи расписание 2026-02-31')).code,'invalid_input');
 assert.ok((await ask(student,'Покажи экзамены')).schedule.every(l=>l.kind!=='Занятие'));
});
test('student → dean → student: clarification, decisions, appeals, announcements and privacy',async()=>{
 const student=await login('demo_student'),other=await login('student011'),teacher=await login('demo_teacher'),dean=await login('demo_dean');
 const create=await call('/api/requests',student,{kind:'Справка об обучении',body:'Для библиотеки',confirm:true});assert.equal(create.status,200);let request=create.body.request;
 const change=async(status,comment='')=>{const r=await call('/api/requests/'+request.id,dean,{status,comment,version:request.version,confirm:true});assert.equal(r.status,200,JSON.stringify(r.body));request=r.body.request;};
 await change('На рассмотрении');await change('Требуется уточнение','Укажите место предоставления');
 assert.equal((await ask(student,'Покажи заявление №'+request.id)).requests[0].status,'Требуется уточнение');
 const endpoint='/api/requests/'+request.id+'/clarification';
 assert.equal((await call(endpoint,other,{body:'Чужое уточнение',version:request.version,confirm:true})).status,403);
 assert.equal((await call(endpoint,student,{body:'В университетскую библиотеку',version:request.version})).status,400);
 const clarification=await call(endpoint,student,{body:'В университетскую библиотеку',version:request.version,confirm:true});assert.equal(clarification.status,200);
 assert.equal((await call(endpoint,student,{body:'Повтор',version:request.version,confirm:true})).status,409);
 const details=(await call('/api/requests/'+request.id,dean)).body;assert.equal(details.clarifications[0].body,'В университетскую библиотеку');assert.equal(details.request.body,'Для библиотеки');request=details.request;
 await change('Одобрена');await change('Готова');assert.equal((await ask(student,'Покажи заявление №'+request.id)).requests[0].status,'Готова');
 assert.equal((await call('/api/requests/'+request.id,other)).status,403);assert.equal((await call('/api/requests/'+request.id,teacher)).status,403);
 const appeal=(await call('/api/appeals',student,{subject:'Консультация',body:'Когда можно прийти?',confirm:true})).body;
 assert.ok((await call('/api/notifications',dean)).body.notifications.some(n=>n.message.includes('Новое обращение №'+appeal.id)));
 const pending=(await call('/api/appeals',dean)).body.appeals.find(a=>a.id===appeal.id);
 assert.equal((await call('/api/appeals/'+pending.id,dean,{reply:'В четверг после занятий.',version:pending.version,confirm:true})).status,200);
 assert.match((await ask(student,'Покажи обращение №'+appeal.id)).items[0].body,/В четверг/);
 assert.equal((await ask(other,'Покажи обращение №'+appeal.id)).items.length,0);
 const announcement=await call('/api/announcements',dean,{audience:'ПИ-01',subject:'Для группы ПИ-01',body:'Проверка аудитории',confirm:true});assert.equal(announcement.status,200);
 assert.ok((await ask(student,'Покажи объявления')).items.some(i=>i.title==='Для группы ПИ-01'));
 assert.ok(!(await ask(other,'Покажи объявления')).items.some(i=>i.title==='Для группы ПИ-01'));
 const notification=(await call('/api/notifications',student)).body.notifications.find(n=>n.message.includes('Готова'));assert.ok(notification);
 await call('/api/notifications/read',other,{id:notification.id});assert.equal(store.one('SELECT read FROM notifications WHERE id=?',notification.id).read,0);
 await call('/api/notifications/read',student,{id:notification.id});assert.equal(store.one('SELECT read FROM notifications WHERE id=?',notification.id).read,1);
});
test('teacher → student grade, dean → teacher move, conflicts and unauthorized writes',async()=>{
 const student=await login('demo_student'),teacher=await login('demo_teacher'),other=await login('teacher002'),dean=await login('demo_dean');
 const grade=(await call('/api/grades',teacher)).body.grades.find(g=>g.student==='demo_student');
 const data={value:5,reason:'Проверка пересдачи',version:grade.version,confirm:true};
 assert.equal((await call('/api/grades/'+grade.id,student,data)).status,403);assert.equal((await call('/api/grades/'+grade.id,other,data)).status,403);
 assert.equal((await call('/api/grades/'+grade.id,teacher,{...data,reason:''})).status,400);
 assert.equal((await call('/api/grades/'+grade.id,teacher,data)).status,200);
 assert.equal((await call('/api/grades/'+grade.id,teacher,data)).status,409);
 assert.ok((await ask(student,'Покажи мои оценки')).items.some(g=>g.title===grade.subject&&g.body==='Оценка: 5'));
 const lesson=(await call('/api/lessons',teacher)).body.lessons[0];
 const proposal=await call('/api/lesson-changes',dean,{...lesson,lessonId:lesson.id,start:'13:00',end:'14:30',confirm:true});assert.equal(proposal.status,200);
 assert.ok((await ask(teacher,'Покажи запросы на перенос')).items.some(i=>i.actions.some(a=>a.recordId===proposal.body.id)));
 assert.equal((await call('/api/lesson-changes/'+proposal.body.id+'/decision',other,{decision:'accept',confirm:true})).status,403);
 assert.equal((await call('/api/lesson-changes/'+proposal.body.id+'/decision',teacher,{decision:'reject',confirm:true,comment:''})).status,400);
 assert.equal((await call('/api/lesson-changes/'+proposal.body.id+'/decision',teacher,{decision:'accept',confirm:true})).status,200);
 assert.equal((await call('/api/lessons',student)).body.lessons.find(l=>l.id===lesson.id).start,'13:00');
 const staff=(await call('/api/staff-requests',dean,{recipient:'demo_teacher',subject:'Согласование',body:'Подтвердите получение',confirm:true})).body;
 const inbox=await ask(teacher,'Покажи обращения');assert.ok(inbox.items.some(i=>i.actions.some(a=>a.id==='staff-reply'&&a.recordId===staff.id)));
 assert.equal((await call('/api/staff-requests/'+staff.id+'/reply',teacher,{reply:'Получено',confirm:true})).status,200);
 assert.ok((await ask(dean,'Покажи обращения')).items.some(i=>i.body.includes('Получено')));
});

test('a date follow-up keeps an explicit dean group and uses the timetable',async()=>{
 const dean=await login('demo_dean');await ask(dean,'Покажи расписание группы ПИ-01');
 const follow=await ask(dean,'А на 2026-12-02?');assert.ok(follow.schedule.length);assert.ok(follow.schedule.every(l=>l.group_id==='ПИ-01'&&l.day==='2026-12-02'));
});

test('portal examples survive reopening once and new events respect the audience',async()=>{
 const {seedPortal}=await import('../backend/portal.mjs');
 seedPortal(store);assert.equal(store.one('SELECT COUNT(*) n FROM portal_examples').n,5);
 const teacher=await login('demo_teacher'),other=await login('teacher002'),dean=await login('demo_dean'),student=await login('demo_student');
 const feed=async cookie=>(await call('/api/portal',cookie)).body.events;
 assert.ok((await feed(teacher)).some(e=>e.demo&&e.kind==='reply'));
 assert.ok(!(await feed(student)).some(e=>e.demo&&(e.kind==='reply'||e.kind==='appeal')));
 assert.ok(!(await feed(other)).some(e=>e.demo&&e.kind==='appeal'));
 const sent=await call('/api/appeals',teacher,{subject:'Проверка ленты',body:'Запрос аудитории'});
 assert.ok((await feed(dean)).some(e=>e.kind==='appeal'&&e.id===sent.body.id&&!e.demo));
 assert.ok(!(await feed(other)).some(e=>e.kind==='appeal'&&e.id===sent.body.id));
});


test('personal message is delivered only to the chosen peer and stays outside the public feed',async()=>{
 const student=await login('demo_student'),teacher=await login('demo_teacher'),dean=await login('demo_dean');
 assert.equal((await ask(student,'Напиши преподавателю личное сообщение')).actions[0].id,'direct-compose');
 const draft={recipient:'demo_teacher',body:'Проверка личной переписки'};
 assert.equal((await call('/api/direct',student,draft)).status,400);
 assert.equal((await call('/api/direct',student,{...draft,confirm:true})).status,200);
 const seen=async(path,cookie)=>JSON.stringify((await call(path,cookie)).body).includes(draft.body);
 assert.ok(await seen('/api/direct?peer=demo_student',teacher));
 assert.ok(!await seen('/api/direct?peer=demo_student',dean));
 assert.ok(!await seen('/api/messages',student));
 assert.ok(!await seen('/api/announcements',teacher));
});
