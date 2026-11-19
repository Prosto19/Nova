import {cpSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../../backend/store.mjs';
import {createRoutes} from '../../backend/routes.mjs';

const out=process.argv[2],vendor=process.argv[3];
if(!out||!vendor)throw Error('Provide output directory and extracted sql.js package');
mkdirSync(out,{recursive:true});
cpSync('public',out,{recursive:true});
for(const file of readdirSync(out).filter(f=>/\.(html|css|js)$/.test(f))){
 let body=readFileSync(join(out,file),'utf8')
  .replace(/(["'`])\/register\/?/g,'$1./mobile.html')
  .replace(/(["'`])\/\?/g,'$1./?')
  .replace(/(href|src)="\/(?!\/)/g,'$1="./')
  .replaceAll("'/intro-reference.png'","'./intro-reference.png'")
  .replace('Ollama ещё не готова. Ручные разделы доступны.','Браузерное демо · встроенные команды NOVA');
 if(file==='index.html')body=body.replace('<head>','<head><script src="./sql-wasm.js"></script><script src="./bridge.js"></script>');
 writeFileSync(join(out,file),body);
}
for(const f of ['sql-wasm.js','sql-wasm.wasm'])cpSync(join(vendor,'dist',f),join(out,f));
cpSync(join(vendor,'LICENSE'),join(out,'sql-js-LICENSE.txt'));
cpSync('scripts/browser-demo/runtime',join(out,'runtime'),{recursive:true});
cpSync('scripts/browser-demo/model-worker.js',join(out,'model-worker.js'));
cpSync('scripts/browser-demo/bridge.js',join(out,'bridge.js'));
mkdirSync(join(out,'backend'),{recursive:true});
for(const file of ['agent','dean','portal','role-agent','routes'])cpSync('backend/'+file+'.mjs',join(out,'backend',file+'.mjs'));
const profile=readFileSync('backend/store.mjs','utf8').split('export const publicUser=')[1];
writeFileSync(join(out,'backend/store.mjs'),'export const publicUser='+profile);
const dir=mkdtempSync(join(tmpdir(),'nova-fictional-seed-')),s=createStore(dir);
createRoutes(s);s.run("UPDATE users SET salt='',hash=''");s.close();
cpSync(join(dir,'nova.sqlite'),join(out,'demo.sqlite'));
writeFileSync(join(out,'.nojekyll'),'');
