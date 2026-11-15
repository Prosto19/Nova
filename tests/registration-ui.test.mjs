import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(await readFile(new URL('../public/mobile.js',import.meta.url),'utf8'),context);
const ui=context.NovaRegistrationDemo;
test('test password validation reports mismatch and length without granting access',()=>{
 assert.match(ui.passwordError('short','short'),/10/);
 assert.match(ui.passwordError('Demo-only-123','Demo-only-124'),/совпадают/);
 assert.equal(ui.passwordError('Demo-only-123','Demo-only-123'),'');
 assert.match(ui.passwordError('a'.repeat(129),'a'.repeat(129)),/128/);
});
test('invitation examples cannot be confused across the two staff scenarios',()=>{
 assert.equal(ui.codeError(' nova-teacher-demo ','NOVA-TEACHER-DEMO'),'');
 assert.notEqual(ui.codeError('NOVA-TEACHER-DEMO','NOVA-DEAN-DEMO'),'');
 assert.notEqual(ui.codeError('','NOVA-0103'),'');
});
test('staff flows omit student tickets; every route has optional passkey then password',()=>{
 assert.ok(ui.flow('student').includes('ticket'));
 for(const role of ['teacher','dean']){assert.ok(!ui.flow(role).includes('ticket'));assert.ok(ui.flow(role).includes('invitation'));}
 for(const role of ['student','teacher','dean']){const steps=ui.flow(role);assert.equal(steps[steps.indexOf('passkey')+1],'password');assert.equal(steps.at(-1),'done');}
});
