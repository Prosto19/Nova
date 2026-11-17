import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'nova-ui-'));process.env.NOVA_DATA_DIR=dir;
const {server}=await import('../server.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const windows=[];
after(async()=>{for(const w of windows)w.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
const wait=async fn=>{const start=Date.now();while(!fn()){if(Date.now()-start>10000)throw Error('UI did not reach expected state');await new Promise(r=>setTimeout(r,20));}};
async function page(role){
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));const dom=new JSDOM(html,{url:base+'/?onboarding='+role,runScripts:'outside-only',virtualConsole:vc});const w=dom.window;windows.push(w);let cookie='';
 w.fetch=async(path,options={})=>{const r=await fetch(new URL(path,base),{...options,headers:{...options.headers,Origin:base,Cookie:cookie}});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return r;};
 w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};
 w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{},set:()=>true});w.HTMLMediaElement.prototype.play=async()=>{};w.HTMLMediaElement.prototype.pause=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
 for(const script of w.document.querySelectorAll('script[src]')){Object.defineProperty(w.document,'currentScript',{configurable:true,value:script});w.eval(await readFile(new URL('../public/'+script.getAttribute('src').slice(1),import.meta.url),'utf8'));}
 await wait(()=>w.document.querySelector('.nova-workspace'));await wait(()=>w.document.querySelector('.nova-tour:not([hidden])'));w.document.querySelector('[data-skip]').click();assert.deepEqual(errors.map(e=>e.message),[]);return w;
}
test('real UI boots each role; schedule answers stay inside chat; sections use backend',async()=>{
 const dean=await page('dean');const d=dean.document;
 const input=d.querySelector('[data-target=chat] input');input.value='Покажи расписание';d.querySelector('[data-target=chat]').dispatchEvent(new dean.Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>d.querySelector('.chat-lesson')).catch(e=>{throw Error(e.message+': '+d.querySelector('.backend-chat').textContent);});assert.equal(d.querySelectorAll('.chat-lesson').length,20);assert.equal(d.querySelector('.workspace-center').hidden,false);assert.equal(d.querySelector('.section-view').hidden,true);assert.ok(d.querySelector('.chat-open-section'));
 d.querySelector('[data-detail="Студенты"]').click();await wait(()=>d.querySelectorAll('.section-body .dean-row').length===100);
 d.querySelector('.section-body [data-action-key]').click();await wait(()=>d.querySelector('.student-identity'));assert.ok(d.querySelector('.student-facts').textContent.includes('Прикладная информатика'));d.querySelector('.detail-top button').click();
 d.querySelector('[data-detail="Документооборот"]').click();await wait(()=>d.querySelectorAll('.section-body .dean-row').length===12);
 d.querySelector('.section-body [data-action-key]').click();await wait(()=>d.querySelector('.request-original'));assert.ok(d.querySelector('.detail-content').textContent.includes('ПИ-'));d.querySelector('.detail-top button').click();
 d.querySelector('[data-detail="Учебный процесс"]').click();await wait(()=>d.querySelector('.section-body [data-action-key]'));d.querySelector('.section-body [data-action-key]').click();await wait(()=>d.querySelector('.slot-picker [data-start="13:00"]'));assert.equal(d.querySelector('.slot-picker [data-start="10:45"]').disabled,true);d.querySelector('.slot-picker [data-start="13:00"]').click();
 d.querySelector('.detail-content form').dispatchEvent(new dean.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>d.querySelector('.dean-modal:not(.dean-detail-modal) [data-action-key=yes]'));d.querySelector('.dean-modal:not(.dean-detail-modal) [data-action-key=yes]').click();await wait(()=>d.querySelector('.changes-panel'));assert.match(d.querySelector('.changes-panel').textContent,/Ожидает ответа/);
 d.querySelector('[data-detail="Аналитика"]').click();await wait(()=>d.querySelector('.analytics-metrics'));const group=d.querySelector('[data-group]');group.value='ПИ-01';group.dispatchEvent(new dean.Event('change'));await wait(()=>d.querySelector('.analytics-metrics strong')?.textContent==='10');
 const student=await page('student1');student.document.querySelector('[data-detail="Справки и заявления"]').click();await wait(()=>student.document.querySelector('.section-body form'));assert.equal(student.document.querySelectorAll('.section-body .dean-row').length,1);
 const teacher=await page('teacher');teacher.document.querySelector('[data-detail="Ведомости"]').click();await wait(()=>teacher.document.querySelector('.section-body .dean-row'));assert.equal(teacher.document.querySelectorAll('.section-body .dean-row').length,40);
 const td=teacher.document;td.querySelector('[data-detail="Расписание"]').click();await wait(()=>td.querySelector('.changes-panel button'));td.querySelector('.changes-panel button').click();td.querySelector('.detail-content form').dispatchEvent(new teacher.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>td.querySelector('.dean-modal:not(.dean-detail-modal) [data-action-key=yes]'));td.querySelector('.dean-modal:not(.dean-detail-modal) [data-action-key=yes]').click();await wait(()=>td.querySelector('.changes-panel')?.textContent.includes('Согласовано'));
 d.querySelector('[data-home]').click();input.value='Создать обращение';d.querySelector('[data-target=chat]').dispatchEvent(new dean.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>[...d.querySelectorAll('.backend-chat button')].some(b=>b.textContent==='Написать обращение в чате'));assert.equal(d.querySelector('.workspace-center').hidden,false);assert.equal(d.querySelector('.backend-chat .dean-form'),null);
 await wait(()=>!d.querySelector('[data-target=chat]').dataset.busy);[...d.querySelectorAll('.backend-chat button')].find(b=>b.textContent==='Написать обращение в чате').click();await wait(()=>d.querySelector('.backend-chat').lastElementChild.textContent.includes('Кому адресовать'));
 await wait(()=>d.querySelector('.backend-chat').lastElementChild.querySelector('button'));d.querySelector('.backend-chat').lastElementChild.querySelector('button').click();await wait(()=>!d.querySelector('[data-target=chat]').dataset.busy);await dean.NOVA_BACKEND.chat('Проверка связи');await dean.NOVA_BACKEND.chat('Прошу уточнить расписание консультаций.');assert.match(d.querySelector('.backend-chat').lastElementChild.textContent,/Проверьте обращение/);[...d.querySelector('.backend-chat').lastElementChild.querySelectorAll('button')].find(b=>b.textContent==='Отправить обращение').click();await wait(()=>d.querySelector('.backend-chat').lastElementChild.textContent.includes('отправлено. Получатель'));
 await dean.NOVA_BACKEND.chat('что ты умешшь');assert.match(d.querySelector('.backend-chat').lastElementChild.textContent,/Выберите задачу/);

 await wait(()=>!d.querySelector('[data-target=chat]').dataset.busy);const realFetch=dean.fetch;dean.fetch=(url,options)=>url==='/api/chat'?new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new dean.DOMException('Aborted','AbortError')))):realFetch(url,options);input.value='Свободный вопрос';d.querySelector('[data-target=chat]').dispatchEvent(new dean.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>d.querySelector('.cancel-wait'));d.querySelector('.cancel-wait').click();await wait(()=>!d.querySelector('[data-target=chat]').dataset.busy);assert.match(d.querySelector('.backend-chat').lastElementChild.textContent,/Ожидание отменено/);dean.fetch=realFetch;

});

test('agent chat publishes only after confirmation, replies, cancels drafts and explains failures',async()=>{
 const w=await page('dean'),d=w.document;
 const last=()=>d.querySelector('.backend-chat').lastElementChild;
 const click=label=>{const b=[...last().querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);b.click();};
 await w.NOVA_BACKEND.chat('Создать объявление');click('Составить объявление');await wait(()=>last().textContent.includes('Кому предназначено'));
 await w.NOVA_BACKEND.chat('student');await w.NOVA_BACKEND.chat('Проверка объявления');await w.NOVA_BACKEND.chat('Тестовое объявление для студентов.');
 const before=(await (await w.fetch('/api/announcements')).json()).announcements.length;assert.match(last().textContent,/Ничего не отправлено/);
 click('Подтвердить отправку');await wait(()=>last().textContent.includes('Объявление опубликовано'));
 assert.equal((await (await w.fetch('/api/announcements')).json()).announcements.length,before+1);
 await w.NOVA_BACKEND.chat('Отправь сообщение в общий чат');click('Написать сообщение');await wait(()=>last().textContent.includes('до 1000'));
 await w.NOVA_BACKEND.chat('Тестовое сообщение.');click('Отменить черновик');await wait(()=>last().textContent.includes('Черновик отменён'));
 await w.NOVA_BACKEND.chat('Отправь сообщение в общий чат');click('Написать сообщение');await wait(()=>last().textContent.includes('до 1000'));
 await w.NOVA_BACKEND.chat('Проверка общего чата.');click('Подтвердить отправку');await wait(()=>last().textContent.includes('Сообщение опубликовано'));
 const student=await page('student1');const created=await (await student.fetch('/api/appeals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:'Тест для агента',body:'Когда консультация?'})})).json();
 await w.NOVA_BACKEND.chat('Покажи обращение №'+created.id);click('Подготовить ответ');await wait(()=>last().textContent.includes('Напишите ответ'));
 await w.NOVA_BACKEND.chat('Консультация согласуется с преподавателем.');click('Подтвердить отправку');await wait(()=>last().textContent.includes('Ответ отправлен'));
 const appeals=(await (await student.fetch('/api/appeals')).json()).appeals;assert.equal(appeals.find(a=>a.id===created.id).status,'Закрыто');
 await w.NOVA_BACKEND.chat('Удали студента');assert.match(last().textContent,/функция пока недоступна/);assert.equal(d.querySelector('.section-view').hidden,true);
 const realFetch=w.fetch;w.fetch=async()=>{throw new TypeError('Failed to fetch');};await w.NOVA_BACKEND.chat('Покажи аналитику');assert.match(last().textContent,/Не удалось связаться с сервером/);assert.ok([...last().querySelectorAll('button')].some(b=>b.textContent==='Повторить запрос'));w.fetch=realFetch;
});

test('student and teacher chat workflows exchange real data with dean and preserve role boundaries',async()=>{
 const student=await page('student1'),dean=await page('dean'),teacher=await page('teacher');
 const last=w=>w.document.querySelector('.backend-chat').lastElementChild;
 const press=(w,label)=>{const b=[...last(w).querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);b.click();};
 const api=async(w,path,data)=>{const r=await w.fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;};
 await student.NOVA_BACKEND.chat('Закажи справку');press(student,'Подготовить заявку');await wait(()=>last(student).textContent.includes('назначение справки'));
 const before=(await api(student,'/api/requests')).requests.length;
 await student.NOVA_BACKEND.chat('Для общежития');assert.match(last(student).textContent,/Ничего не отправлено/);assert.equal((await api(student,'/api/requests')).requests.length,before);
 press(student,'Подтвердить отправку');await wait(()=>last(student).textContent.includes('Заявка отправлена'));let req=(await api(student,'/api/requests')).requests[0];assert.equal(req.body,'Для общежития');
 req=(await api(dean,'/api/requests/'+req.id,{status:'На рассмотрении',version:req.version,confirm:true})).request;
 req=(await api(dean,'/api/requests/'+req.id,{status:'Требуется уточнение',comment:'Укажите номер общежития',version:req.version,confirm:true})).request;
 await student.NOVA_BACKEND.chat('Покажи заявление №'+req.id);press(student,'Ответить на уточнение');await wait(()=>last(student).textContent.includes('Напишите дополнение'));
 await student.NOVA_BACKEND.chat('Общежитие №2');press(student,'Подтвердить отправку');await wait(()=>last(student).textContent.includes('Уточнение отправлено'));
 const detail=await api(dean,'/api/requests/'+req.id);assert.equal(detail.request.status,'На рассмотрении');assert.equal(detail.clarifications[0].body,'Общежитие №2');
 student.document.querySelector('[data-detail="Справки и заявления"]').click();await wait(()=>student.document.querySelector('.section-body [data-action-key]'));student.document.querySelector('.section-body [data-action-key]').click();await wait(()=>student.document.querySelector('.request-original'));assert.equal(student.document.querySelector('.detail-content form'),null);assert.match(student.document.querySelector('.detail-content').textContent,/Общежитие №2/);student.document.querySelector('.detail-top button').click();student.document.querySelector('[data-home]').click();
 await student.NOVA_BACKEND.chat('Создать обращение');press(student,'Написать обращение в деканат');await wait(()=>last(student).textContent.includes('Напишите тему'));
 await student.NOVA_BACKEND.chat('Вопрос о практике');await student.NOVA_BACKEND.chat('Когда начинается практика?');press(student,'Подтвердить отправку');await wait(()=>last(student).textContent.includes('Обращение отправлено'));
 assert.ok((await api(dean,'/api/appeals')).appeals.some(a=>a.subject==='Вопрос о практике'));
 await teacher.NOVA_BACKEND.chat('Изменить оценку');press(teacher,'Исправить оценку');await wait(()=>last(teacher).textContent.includes('Выберите новую оценку'));
 await teacher.NOVA_BACKEND.chat('5');await teacher.NOVA_BACKEND.chat('Проверена работа после пересдачи');press(teacher,'Подтвердить отправку');await wait(()=>last(teacher).textContent.includes('Оценка исправлена'));
 await student.NOVA_BACKEND.chat('Покажи мои оценки');assert.match(last(student).textContent,/Оценка: 5/);
 const lesson=(await api(teacher,'/api/lessons')).lessons[0];await api(dean,'/api/lesson-changes',{...lesson,lessonId:lesson.id,start:'14:45',end:'16:15',confirm:true});
 await teacher.NOVA_BACKEND.chat('Покажи запросы на перенос');press(teacher,'Рассмотреть перенос');await wait(()=>last(teacher).textContent.includes('Согласовать или отклонить'));
 await teacher.NOVA_BACKEND.chat('accept');await teacher.NOVA_BACKEND.chat('Время подходит');press(teacher,'Подтвердить отправку');await wait(()=>last(teacher).textContent.includes('Решение сохранено'));
 await student.NOVA_BACKEND.chat('Покажи расписание');assert.match(last(student).textContent,/14:45/);
 await student.NOVA_BACKEND.chat('Поставь оценку 5');assert.match(last(student).textContent,/не может изменять оценки/);
 await teacher.NOVA_BACKEND.chat('Создай объявление');assert.match(last(teacher).textContent,/может деканат/);
 for(const w of [student,teacher]){assert.equal(w.document.querySelector('.section-view').hidden,true);assert.ok(w.document.querySelector('[aria-label="Отправить запрос"]'));}
});

test('uncertain submission keeps draft and blocks duplicate sends',async()=>{
 const w=await page('student1'),d=w.document,last=()=>d.querySelector('.backend-chat').lastElementChild;
 await w.NOVA_BACKEND.chat('Закажи справку');[...last().querySelectorAll('button')].find(b=>b.textContent==='Подготовить заявку').click();await wait(()=>last().textContent.includes('назначение справки'));
 await w.NOVA_BACKEND.chat('Для теста сетевого обрыва');const real=w.fetch;let submissions=0;w.fetch=async(path,opts)=>{if(path==='/api/requests'&&opts?.method==='POST'){submissions++;throw Error('Connection lost');}return real(path,opts);};
 const submit=[...last().querySelectorAll('button')].find(b=>b.textContent==='Подтвердить отправку');submit.click();await wait(()=>last().textContent.includes('Результат отправки неизвестен'));assert.equal(submit.disabled,true);await w.NOVA_BACKEND.chat('Отправь повторно');assert.match(last().textContent,/Повторная отправка заблокирована/);assert.equal(submissions,1);assert.ok(![...last().querySelectorAll('button')].some(b=>b.textContent==='Подтвердить отправку'));w.fetch=real;await w.NOVA_BACKEND.chat('Отмена');
});

test('fast reply stays cancellable during the visual beat',async()=>{
 const w=await page('student1');w.matchMedia=()=>({matches:false});
 const pending=w.NOVA_BACKEND.chat('Покажи расписание');
 await wait(()=>w.document.querySelector('.nova-pending .cancel-wait'));
 await new Promise(r=>setTimeout(r,90));
 const button=w.document.querySelector('.nova-pending .cancel-wait');assert.ok(button);button.click();await pending;
 assert.match(w.document.querySelector('.backend-chat').lastElementChild.textContent,/Ожидание отменено/);
 assert.equal(w.document.querySelector('.backend-chat .chat-lesson'),null);
});
