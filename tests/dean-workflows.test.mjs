import {test,after} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'nova-dean-flow-'));process.env.NOVA_DATA_DIR=dir;const {server,store}=await import('../server.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
async function call(path,cookie='',body){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const login=async name=>(await call('/api/login','',{login:name,password:'Nova2026!'})).cookie;
test('dean: student details, calendar proposal, teacher decision and staff request',async()=>{
 const dean=await login('demo_dean'),teacher=await login('demo_teacher'),other=await login('teacher002'),student=await login('demo_student');
 const info=await call('/api/students/demo_student',dean);assert.equal(info.body.student.group_id,'ПИ-01');assert.equal(info.body.grades.length,2);assert.equal((await call('/api/students/demo_student',other)).status,403);assert.equal((await call('/api/students/student011',student)).status,403);
 const lesson=(await call('/api/lessons',teacher)).body.lessons[0];const slots=await call(`/api/lessons/${lesson.id}/availability?day=${lesson.day}&room=${lesson.room}`,dean);assert.equal(slots.body.slots.find(s=>s.start==='10:45').available,false);assert.equal(slots.body.slots.find(s=>s.start==='13:00').available,true);
 const proposal=await call('/api/lesson-changes',dean,{...lesson,lessonId:lesson.id,start:'13:00',end:'14:30',confirm:true});assert.equal(proposal.status,200);assert.equal((await call('/api/lessons',student)).body.lessons[0].start,'09:00');
 assert.equal((await call('/api/lesson-changes',dean,{...lesson,lessonId:lesson.id,start:'14:45',end:'16:15',confirm:true})).status,409);
 assert.equal((await call(`/api/lesson-changes/${proposal.body.id}/decision`,other,{decision:'accept',confirm:true})).status,403);
 assert.equal((await call(`/api/lesson-changes/${proposal.body.id}/decision`,teacher,{decision:'accept',confirm:true})).status,200);
 assert.equal((await call('/api/lessons',student)).body.lessons.find(l=>l.id===lesson.id).start,'13:00');assert.ok((await call('/api/notifications',student)).body.notifications.some(n=>n.message.includes('Перенос согласован')));
 assert.equal((await call(`/api/lesson-changes/${proposal.body.id}/decision`,teacher,{decision:'accept',confirm:true})).status,409);
 const staff=await call('/api/staff-requests',dean,{recipient:'demo_teacher',subject:'Консультация',body:'Уточните дату',confirm:true});assert.equal(staff.status,200);assert.equal((await call('/api/staff-requests',teacher)).body.requests.length,1);assert.equal((await call('/api/staff-requests',other)).body.requests.length,0);
 assert.equal((await call(`/api/staff-requests/${staff.body.id}/reply`,teacher,{reply:'В пятницу',confirm:true})).status,200);assert.equal((await call('/api/staff-requests',dean)).body.requests[0].reply,'В пятницу');
 const stats=await call('/api/dean/analytics?group='+encodeURIComponent('ПИ-01'),dean);assert.equal(stats.body.students,10);assert.equal(stats.body.groups.length,1);assert.equal(stats.body.average,3);
 const guidance=await call('/api/chat',dean,{message:'Сделать обращение'});assert.equal(guidance.status,200);assert.equal(guidance.body.actions[0].id,'compose-staff');assert.equal((await call('/api/staff-requests',teacher)).body.requests.length,1,'chat instruction must not send automatically');
 const req=(await call('/api/requests',student)).body.requests[0];assert.equal((await call('/api/requests/'+req.id,dean)).body.request.group_id,'ПИ-01');assert.equal((await call('/api/requests/'+req.id,other)).status,403);
});
