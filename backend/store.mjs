import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
export function createStore(dir){
 mkdirSync(dir,{recursive:true});const db=new DatabaseSync(join(dir,'nova.sqlite'));
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(login TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('student','teacher','dean')),group_id TEXT NOT NULL DEFAULT '',course INTEGER NOT NULL DEFAULT 0,salt TEXT NOT NULL,hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,subject TEXT NOT NULL,group_id TEXT NOT NULL,teacher TEXT NOT NULL REFERENCES users(login),day TEXT NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL,room TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'Занятие',version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY,student TEXT NOT NULL REFERENCES users(login),kind TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Новая',comment TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS grades(id INTEGER PRIMARY KEY,student TEXT NOT NULL REFERENCES users(login),teacher TEXT NOT NULL REFERENCES users(login),subject TEXT NOT NULL,value INTEGER NOT NULL CHECK(value BETWEEN 2 AND 5),version INTEGER NOT NULL DEFAULT 1,UNIQUE(student,subject));
 CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,recipient TEXT NOT NULL REFERENCES users(login),message TEXT NOT NULL,read INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY,author TEXT NOT NULL REFERENCES users(login),audience TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,author TEXT NOT NULL REFERENCES users(login),body TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS appeals(id INTEGER PRIMARY KEY,author TEXT NOT NULL REFERENCES users(login),subject TEXT NOT NULL,body TEXT NOT NULL,reply TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Открыто',version INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL REFERENCES users(login),action TEXT NOT NULL,entity TEXT NOT NULL,entity_id INTEGER NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS chats(id INTEGER PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(login),role TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS notification_owner ON notifications(recipient,id);
 CREATE INDEX IF NOT EXISTS request_owner ON requests(student,id);
 CREATE INDEX IF NOT EXISTS chat_owner ON chats(owner,id);
 PRAGMA user_version=1;`);
 const all=(sql,...args)=>db.prepare(sql).all(...args),one=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 if(!one('SELECT login FROM users LIMIT 1'))transaction(()=>{
  const names=['Алексей','Иван','Михаил','Дмитрий','Артём','Никита','Павел','Максим','Роман','Олег'];const surnames=['Северин','Белов','Орлов','Соколов','Морозов','Волков','Леснов','Романов','Крылов','Зайцев'];
  const add=(login,name,role,group='',course=0)=>{const salt=randomBytes(16).toString('hex');run('INSERT INTO users VALUES(?,?,?,?,?,?,?)',login,name,role,group,course,salt,scryptSync('Nova2026!',salt,64).toString('hex'));};
  for(let i=1;i<=100;i++)add(i===1?'demo_student':i===2?'demo_student2':'student'+String(i).padStart(3,'0'),i===2?'Мария Волкова':`${names[(i-1)%10]} ${surnames[Math.floor((i-1)/10)]}`, 'student','ПИ-'+String(Math.floor((i-1)/10)+1).padStart(2,'0'),Math.floor((i-1)/25)+1);
  for(let i=1;i<=6;i++)add(i===1?'demo_teacher':'teacher00'+i,`${names[i+2]} ${surnames[i+2]}`,'teacher');
  for(let i=1;i<=3;i++)add(i===1?'demo_dean':'dean00'+i,['Елена Березина','Анна Соколова','Марина Белова'][i-1],'dean');
  const teachers=all("SELECT login FROM users WHERE role='teacher' ORDER BY login");
  for(let g=1;g<=10;g++){
   const group='ПИ-'+String(g).padStart(2,'0'),teacher=teachers[(g-1)%6].login;
   for(let j=0;j<2;j++)run('INSERT INTO lessons(subject,group_id,teacher,day,start,end,room,kind) VALUES(?,?,?,?,?,?,?,?)',j?'Программирование':'Математика',group,teacher,'2026-12-'+String(g+1).padStart(2,'0'),j?'11:00':'09:00',j?'12:30':'10:30',String(300+g),j?'Занятие':'Экзамен');
   for(const u of all('SELECT login FROM users WHERE group_id=?',group))for(const subject of ['Математика','Программирование'])run('INSERT INTO grades(student,teacher,subject,value) VALUES(?,?,?,?)',u.login,teacher,subject,2+(g%4));
  }
  for(const u of all("SELECT login FROM users WHERE role='student' ORDER BY login LIMIT 12"))run('INSERT INTO requests(student,kind,body) VALUES(?,?,?)',u.login,'Справка об обучении','Прошу подготовить справку. Вымышленные учебные данные.');
 });
 // Compatibility export for existing local tooling; contains hashes, never passwords.
 writeFileSync(join(dir,'users.json'),JSON.stringify(all('SELECT * FROM users')),{mode:0o600});
 const audit=(actor,action,entity,id,before,after)=>run('INSERT INTO audit(actor,action,entity,entity_id,before_json,after_json) VALUES(?,?,?,?,?,?)',actor,action,entity,id,JSON.stringify(before),JSON.stringify(after));
 const notify=(recipient,message)=>run('INSERT INTO notifications(recipient,message) VALUES(?,?)',recipient,message);
 return {db,all,one,run,transaction,audit,notify,close:()=>db.close()};
}
export const publicUser=u=>({login:u.login,name:u.name,role:{student:'Студент',teacher:'Преподаватель',dean:'Сотрудник деканата'}[u.role],roleId:u.role,group:u.group_id,course:u.course||'',university:'Учебный университет NOVA',faculty:'Факультет информатики',direction:u.role==='student'?'Прикладная информатика':'',department:u.role==='teacher'?'Кафедра информатики':'Деканат',position:u.role==='dean'?'Специалист деканата':u.role==='teacher'?'Преподаватель':'Студент'});
