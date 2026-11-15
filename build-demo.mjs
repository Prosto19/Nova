import {mkdir,copyFile,readFile,writeFile,cp,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const dest=resolve(root,process.env.NOVA_OUTPUT_DIR||'sites/nova-mobile/dist');
const rawBase=process.env.NOVA_BASE_PATH||'';
if(rawBase && !/^\/[a-zA-Z0-9._/-]*$/.test(rawBase))throw new Error('Invalid NOVA_BASE_PATH');
const base=rawBase==='/'?'':rawBase.replace(/\/$/,'');
await mkdir(join(dest,'register'),{recursive:true});
for(const name of ['styles.css','experience.css','mobile.css','experience.js','intro.js','intro-reference.png','mobile.js','qrcode.js','workspace.js','workspace.css','roles.js'])await copyFile(join(root,'public',name),join(dest,name));
let html=await readFile(join(root,'public/index.html'),'utf8');
html=html.replace('src="/app.js"','src="/demo-app.js"');
await writeFile(join(dest,'index.html'),html);
await copyFile(join(root,'public/mobile.html'),join(dest,'register/index.html'));
await copyFile(join(root,'public/demo-app.js'),join(dest,'demo-app.js'));
await writeFile(join(dest,'THIRD-PARTY.txt'),'QR Code Generator for JavaScript — Copyright (c) 2009 Kazuhiko Arase, MIT. Source: https://github.com/kazuhikoarase/qrcode-generator\nLicense notice is preserved in qrcode.js.\nSilero CIS Base voice model: MIT, copyright Silero Team. License and provenance: audio/LICENSE.txt and audio/README.md.\n');
await cp(join(root,'public/audio'),join(dest,'audio'),{recursive:true});
// Project Pages live under /repository/, unlike a custom domain or Sites root.
if(base){
 const rewrite=async folder=>{for(const item of await readdir(folder,{withFileTypes:true})){
  const path=join(folder,item.name);if(item.isDirectory()){await rewrite(path);continue;}
  if(!/\.(html|js|css)$/.test(item.name))continue;
  const source=await readFile(path,'utf8');
  await writeFile(path,source.replace(/(["'`])\/(?!\/)/g,(_,quote)=>quote+base+'/'));
 }};
 await rewrite(dest);
}
await writeFile(join(dest,'.nojekyll'),'');
console.log('Static demo ready: '+dest);
