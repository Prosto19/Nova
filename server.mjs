import http from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = process.env.NOVA_DATA_DIR || root + '.data';
await mkdir(dataDir, { recursive: true });
let users;
try { users = JSON.parse(await readFile(dataDir + '/users.json', 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  users = [['demo_student','Александр Миронов','Студент'],['demo_student2','Мария Волкова','Студент'],['demo_dean','Анна Соколова','Сотрудник деканата']].map(([login,name,role]) => {
    const salt = randomBytes(16).toString('hex');
    return {login,name,role,salt,hash:scryptSync('Nova2026!',salt,64).toString('hex')};
  });
  await writeFile(dataDir + '/users.json', JSON.stringify(users), {mode:0o600});
}
const sessions = new Map(), attempts = new Map();
const ttl = 8 * 60 * 60 * 1000;
const cleanup = setInterval(() => { const now=Date.now(); for(const [k,v] of sessions) if(v.expires<now)sessions.delete(k); for(const [k,v] of attempts)if(v.until<now)attempts.delete(k); },60000);
cleanup.unref();
function reply(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data)); }
function cookie(req) {return /(?:^|;\s*)nova_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];}
function publicUser(u) {return {login:u.login,name:u.name,role:u.role};}
async function body(req) {let s='';for await (const c of req){s+=c;if(s.length>4096)throw new Error('size');}return JSON.parse(s);}
export const server = http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const path = new URL(req.url,'http://localhost').pathname;
  const sid=cookie(req), session=sessions.get(sid);
  if(session && session.expires < Date.now())sessions.delete(sid);
  if(req.method==='POST'){
    if(!req.headers.origin || req.headers.origin !== `http://${req.headers.host}`)return reply(res,403,{error:'Недопустимый источник запроса.'});
    if(req.headers['content-type']?.split(';')[0]!=='application/json')return reply(res,415,{error:'Ожидается JSON.'});
  }
  if(path==='/api/session' && req.method==='GET')return reply(res,200,{user:sessions.has(sid)?publicUser(session.user):null});
  if(path==='/api/login' && req.method==='POST'){
    const ip=req.socket.remoteAddress, now=Date.now();let a=attempts.get(ip);
    if(a && a.until>now && a.count>=10)return reply(res,429,{error:'Слишком много попыток. Повторите через 15 минут.'});
    if(!a || a.until<=now){a={count:0,until:now+900000};attempts.set(ip,a);}
    let input;try{input=await body(req);}catch{return reply(res,400,{error:'Некорректный запрос.'});}
    if(typeof input.login!=='string'||typeof input.password!=='string'||input.login.length>100||input.password.length>256)return reply(res,400,{error:'Проверьте логин и пароль.'});
    a.count++;
    const u=users.find(x=>x.login===input.login.trim().toLowerCase());
    const hash=scryptSync(input.password,u?.salt || users[0].salt,64);
    if(!u || !timingSafeEqual(hash,Buffer.from(u.hash,'hex')))return reply(res,401,{error:'Неверный логин или пароль. Попробуйте ещё раз.'});
    attempts.delete(ip); if(sid)sessions.delete(sid);
    const token=randomBytes(32).toString('hex');sessions.set(token,{user:u,expires:now+ttl});
    res.setHeader('Set-Cookie',`nova_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttl/1000}`);
    return reply(res,200,{user:publicUser(u)});
  }
  if(path==='/api/logout' && req.method==='POST'){sessions.delete(sid);res.setHeader('Set-Cookie','nova_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return reply(res,200,{ok:true});}
  const files={'/roles.js':'roles.js','/':'index.html','/register':'mobile.html','/register/':'mobile.html','/mobile.html':'mobile.html','/mobile.js':'mobile.js','/mobile.css':'mobile.css','/qrcode.js':'qrcode.js','/workspace.js':'workspace.js','/workspace.css':'workspace.css','/styles.css':'styles.css','/app.js':'app.js','/intro.js':'intro.js','/experience.css':'experience.css','/experience.js':'experience.js','/intro-reference.png':'intro-reference.png'};
  for(const role of ['teacher','dean'])for(let i=0;i<7;i++)files['/audio/'+role+'-'+i+'.wav']='audio/'+role+'-'+i+'.wav';
  for(let i=0;i<8;i++)files['/audio/tour-'+i+'.wav']='audio/tour-'+i+'.wav';
  if(req.method==='GET'&&files[path]){try{const content=await readFile(root+'public/'+files[path]);res.setHeader('Content-Type',path.endsWith('.wav')?'audio/wav':path.endsWith('.png')?'image/png':path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(content);}catch{reply(res,500,{error:'Не удалось загрузить страницу.'});}return;}
  reply(res,404,{error:'Не найдено'});
});
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('NOVA: http://localhost:'+ (process.env.PORT||3000)));

