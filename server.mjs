import http from 'node:http';
import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from 'node:process';
import {createStore,publicUser} from './backend/store.mjs';
import {createRoutes,ApiError} from './backend/routes.mjs';
import {createOllama} from './backend/ollama.mjs';
try{loadEnvFile(fileURLToPath(new URL('.env',import.meta.url)));}catch(e){if(e.code!=='ENOENT')throw e;}
const root=fileURLToPath(new URL('.',import.meta.url));
const hostedOrigin=process.env.RENDER_EXTERNAL_URL ? new URL(process.env.RENDER_EXTERNAL_URL) : null;
if(hostedOrigin && hostedOrigin.protocol!=='https:')throw Error('Hosted NOVA requires HTTPS');
const secureCookie=hostedOrigin?'; Secure':'';
export const store=createStore(process.env.NOVA_DATA_DIR||root+'.data');
const routes=createRoutes(store),ollama=createOllama(store,routes.context),derive=promisify(scrypt);
const sessions=new Map(),attempts=new Map();const ttl=8*60*60*1000;
const cleanup=setInterval(()=>{const now=Date.now();for(const [k,v] of sessions)if(v.expires<now)sessions.delete(k);for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);},60000);cleanup.unref();
function reply(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
function cookie(req){return /(?:^|;\s*)nova_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];}
async function body(req){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>16384)throw new ApiError(413,'Запрос слишком большой.');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'Некорректный JSON.');}}
export const server=http.createServer(async(req,res)=>{try{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 if(hostedOrigin ? req.headers.host!==hostedOrigin.host : !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host||''))return reply(res,403,{error:'Только локальный доступ.'});
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
 if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'Метод недоступен.'});
 if(req.method==='POST'){
  if(req.headers.origin!==(hostedOrigin?.origin||`http://${req.headers.host}`))return reply(res,403,{error:'Недопустимый источник запроса.'});
  if(req.headers['content-type']?.split(';')[0]!=='application/json')return reply(res,415,{error:'Ожидается JSON.'});
 }
 const sid=cookie(req);let session=sessions.get(sid);if(session&&session.expires<Date.now()){sessions.delete(sid);session=undefined;}
 if(path==='/api/session'&&req.method==='GET')return reply(res,200,{user:session?publicUser(session.user):null});
 if(path==='/api/login'&&req.method==='POST'){
  const ip=req.socket.remoteAddress,now=Date.now();let a=attempts.get(ip);if(a&&a.until>now&&a.count>=10)return reply(res,429,{error:'Слишком много попыток. Повторите через 15 минут.'});
  if(!a||a.until<=now){a={count:0,until:now+900000};attempts.set(ip,a);}const input=await body(req);
  if(typeof input?.login!=='string'||typeof input.password!=='string'||input.login.length>100||input.password.length>256)return reply(res,400,{error:'Проверьте логин и пароль.'});a.count++;
  const u=store.one('SELECT * FROM users WHERE login=?',input.login.trim().toLowerCase());const salt=u?.salt||'nova-missing-user-salt';const hash=await derive(input.password,salt,64);
  if(!u||!timingSafeEqual(hash,Buffer.from(u.hash,'hex')))return reply(res,401,{error:'Неверный логин или пароль.'});
  attempts.delete(ip);if(sid)sessions.delete(sid);const token=randomBytes(32).toString('hex');sessions.set(token,{user:u,expires:now+ttl});res.setHeader('Set-Cookie',`nova_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttl/1000}${secureCookie}`);return reply(res,200,{user:publicUser(u)});
 }
 if(path==='/api/logout'&&req.method==='POST'){sessions.delete(sid);res.setHeader('Set-Cookie','nova_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+secureCookie);return reply(res,200,{ok:true});}
 if(path.startsWith('/api/')){
  if(!session)return reply(res,401,{error:'Войдите в аккаунт.'});const b=req.method==='POST'?await body(req):{};if(b===null||Array.isArray(b)||typeof b!=='object')throw new ApiError(400,'Ожидается объект.');
  if(path==='/api/llm/status'&&req.method==='GET')return reply(res,200,await ollama.status());
  if(path==='/api/chat'&&req.method==='POST'){
   const direct=routes.readAnswer(session.user,b.message);
   if(direct){store.transaction(()=>{store.run('INSERT INTO chats(owner,role,body) VALUES(?,?,?)',session.user.login,'user',b.message);store.run('INSERT INTO chats(owner,role,body) VALUES(?,?,?)',session.user.login,'assistant',direct.answer+'\n'+(direct.schedule||[]).map(l=>`${l.day} ${l.start}–${l.end} · ${l.subject} · ${l.group_id} · ${l.room}`).join('\n'));});return reply(res,200,direct);}
   const controller=new AbortController();const cancel=()=>{if(!res.writableEnded)controller.abort();};res.once('close',cancel);try{return reply(res,200,await ollama.chat(session.user,b.message,{signal:controller.signal}));}finally{res.removeListener('close',cancel);}
  }
  if(path==='/api/chat'&&req.method==='GET')return reply(res,200,{messages:store.all('SELECT role,body,created FROM chats WHERE owner=? ORDER BY id DESC LIMIT 40',session.user.login).reverse()});
  const result=await routes.handle(req.method,path,session.user,b,url);if(result!==undefined)return reply(res,200,result);return reply(res,404,{error:'Не найдено.'});
 }
  const files={'/backend-ui.js':'backend-ui.js','/backend-ui.css':'backend-ui.css','/dean.js':'dean.js','/dean.css':'dean.css','/roles.js':'roles.js','/':'index.html','/register':'mobile.html','/register/':'mobile.html','/mobile.html':'mobile.html','/mobile.js':'mobile.js','/mobile.css':'mobile.css','/qrcode.js':'qrcode.js','/workspace.js':'workspace.js','/workspace.css':'workspace.css','/styles.css':'styles.css','/app.js':'app.js','/intro.js':'intro.js','/experience.css':'experience.css','/experience.js':'experience.js','/intro-reference.png':'intro-reference.png'};
  for(const role of ['teacher','dean-v4'])for(let i=0;i<(role==='teacher'?7:14);i++)files['/audio/'+role+'-'+i+'.wav']='audio/'+role+'-'+i+'.wav';
  for(let i=0;i<8;i++)files['/audio/tour-'+i+'.wav']='audio/tour-'+i+'.wav';
  if(req.method==='GET'&&files[path]){try{const content=await readFile(root+'public/'+files[path]);res.setHeader('Content-Type',path.endsWith('.wav')?'audio/wav':path.endsWith('.png')?'image/png':path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(content);}catch{reply(res,500,{error:'Не удалось загрузить страницу.'});}return;}
 reply(res,404,{error:'Не найдено.'});
 }catch(e){if(!res.headersSent)reply(res,e instanceof ApiError?e.status:500,{error:e instanceof ApiError?e.message:'Ошибка сервера. Повторите запрос.'});else res.end();if(!(e instanceof ApiError))console.error(e.message);}
});
server.on('close',()=>{clearInterval(cleanup);store.close();});
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||3000),hostedOrigin?'0.0.0.0':'127.0.0.1',()=>console.log('NOVA: http://localhost:'+(process.env.PORT||3000)));
