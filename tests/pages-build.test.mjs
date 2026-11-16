import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
test('GitHub Pages subpath contains all test entries and role audio',async()=>{
 const dest=await mkdtemp(join(tmpdir(),'nova-pages-'));
 execFileSync(process.execPath,['build-demo.mjs'],{env:{...process.env,NOVA_OUTPUT_DIR:dest,NOVA_BASE_PATH:'/Nova'},stdio:'pipe'});
 const html=await readFile(join(dest,'index.html'),'utf8');
 assert.ok(html.includes('src="/Nova/roles.js"'));assert.ok(html.includes('src="/Nova/demo-app.js"'));
 const experience=await readFile(join(dest,'experience.js'),'utf8');new vm.Script(experience);
 for(const role of ['student1','teacher','dean'])assert.ok(experience.includes('/Nova/?onboarding='+role));
 const workspace=await readFile(join(dest,'workspace.js'),'utf8');new vm.Script(workspace);
 const base=new URL('audio/',new URL('.','https://prosto19.github.io/Nova/workspace.js'));
 for(const voice of ['tour-0','teacher-0','dean-0']){
  assert.equal(new URL(voice+'.wav',base).pathname,'/Nova/audio/'+voice+'.wav');
  const wav=await readFile(join(dest,'audio',voice+'.wav'));assert.equal(wav.toString('ascii',0,4),'RIFF');
 }
 const mobile=await readFile(join(dest,'register/index.html'),'utf8');assert.ok(mobile.includes('/Nova/mobile.js'));
});
