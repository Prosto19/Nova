import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'nova-agent-'));process.env.NOVA_DATA_DIR=dir;
const {server,store}=await import('../server.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
async function call(path,cookie='',body){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
test('dean agent covers its catalog, reads real data and refuses unavailable operations without writes',async()=>{
 const dean=(await call('/api/login','',{login:'demo_dean',password:'Nova2026!'})).cookie;
 const ask=async message=>{const r=await call('/api/chat',dean,{message});assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(['workflow','database'].includes(r.body.source),message);return r.body;};
 const catalog=await ask('Какие функции доступны?');assert.equal(catalog.actions.length,13);
 for(const action of catalog.actions)await ask(action.prompt);
 const students=await ask('Найди студентов группы ПИ-01');assert.equal(students.items.length,10);assert.ok(students.items.every(i=>i.body.includes('ПИ-01')));
 assert.equal((await ask('Найди студента Несуществующий')).items.length,0);
 const analytic=await ask('Покажи аналитику группы ПИ-01');assert.equal(analytic.items.find(i=>i.title==='Студенты').body,'10');
 const grades=await ask('Покажи задолженности группы ПИ-01');assert.ok(grades.items.every(i=>i.body.includes('оценка 2')));
 assert.equal((await ask('Покажи заявление №99999')).requests.length,0);
 const before=store.one('SELECT COUNT(*) n FROM audit').n;
 for(const prompt of ['Удали студента','Отправь расписание в Telegram','Создай экзамен','Сформируй справку PDF','Сделай резервную копию','Создай аккаунт преподавателя','Отчисли студента']){const r=await ask(prompt);assert.equal(r.code,'unsupported_action',prompt);assert.match(r.answer,/недоступна/);}
 assert.equal((await ask('Поставь оценку 5 студенту')).code,'permission_denied');
 assert.equal(store.one('SELECT COUNT(*) n FROM audit').n,before);
 assert.equal((await call('/api/announcements',dean,{audience:'all',subject:'Test',body:'Test'})).status,400);
 assert.equal((await call('/api/chat',dean,{message:''})).status,400);
 assert.equal((await call('/api/chat','',{message:'Покажи аналитику'})).status,401);
});
