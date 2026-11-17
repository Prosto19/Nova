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
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};
 w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{},set:()=>true});w.HTMLMediaElement.prototype.play=async()=>{};w.HTMLMediaElement.prototype.pause=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
 for(const script of w.document.querySelectorAll('script[src]')){Object.defineProperty(w.document,'currentScript',{configurable:true,value:script});w.eval(await readFile(new URL('../public/'+script.getAttribute('src').slice(1),import.meta.url),'utf8'));}
 await wait(()=>w.document.querySelector('.nova-workspace'));await wait(()=>w.document.querySelector('.nova-tour:not([hidden])'));w.document.querySelector('[data-skip]').click();assert.deepEqual(errors.map(e=>e.message),[]);return w;
}
test('real UI boots each role; schedule answers stay inside chat; sections use backend',async()=>{
 const dean=await page('dean');const d=dean.document;
 const input=d.querySelector('[data-target=chat] input');input.value='Покажи расписание';d.querySelector('[data-target=chat]').dispatchEvent(new dean.Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>d.querySelector('.chat-lesson'));assert.equal(d.querySelectorAll('.chat-lesson').length,20);assert.equal(d.querySelector('.workspace-center').hidden,false);assert.equal(d.querySelector('.section-view').hidden,true);assert.ok(d.querySelector('.chat-open-section'));
 d.querySelector('[data-detail="Студенты"]').click();await wait(()=>d.querySelectorAll('.section-body .dean-row').length===100);
 d.querySelector('[data-detail="Документооборот"]').click();await wait(()=>d.querySelectorAll('.section-body .dean-row').length===12);
 const student=await page('student1');student.document.querySelector('[data-detail="Справки и заявления"]').click();await wait(()=>student.document.querySelector('.section-body form'));assert.equal(student.document.querySelectorAll('.section-body .dean-row').length,1);
 const teacher=await page('teacher');teacher.document.querySelector('[data-detail="Ведомости"]').click();await wait(()=>teacher.document.querySelector('.section-body .dean-row'));assert.equal(teacher.document.querySelectorAll('.section-body .dean-row').length,40);
});
