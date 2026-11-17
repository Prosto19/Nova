import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context={};vm.runInNewContext(await readFile(new URL('../public/roles.js',import.meta.url),'utf8'),context);
const roles=context.NOVA_ROLES;
test('each role exposes only its core tools and all tour targets exist',()=>{
 assert.deepEqual(Array.from(roles.teacher.sections,x=>x[0]),['schedule','notifications','exams']);
 assert.deepEqual(Array.from(roles.dean.sections,x=>x[0]),['students','academic','documents','communications','admissions','analytics','community']);
 assert.ok(roles.student.sections.some(x=>x[0]==='grades'));
 for(const role of Object.values(roles)){
  const ids=new Set(['greeting','chat','profile-card','manual','suggestions','events',...role.sections.map(x=>x[0])]);
  for(const step of role.tour)assert.ok(ids.has(step.target),step.target);
  for(const card of role.cards)assert.ok(role.sections.some(x=>x[0]===card[0]));
 }
});
test('all role tour clips are packaged and captions match their spoken text',async()=>{
 for(const role of Object.values(roles))for(const step of role.tour){
  if(step.speech)assert.equal(step.speech.replaceAll('+',''),step.text);
  const wav=await readFile(new URL(`../public/audio/${step.audio}.wav`,import.meta.url));
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.ok(wav.length>48000);
 }
});
