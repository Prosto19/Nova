(() => {
 const base=new URL('.',document.currentScript.src);
 const nativeFetch=window.fetch.bind(window);
 const key='nova-jury-db-v1',session='nova-jury-user';
 const ready=Promise.all([initSqlJs({locateFile:f=>new URL(f,base).href}),import(new URL('backend/routes.mjs',base)),import(new URL('backend/store.mjs',base)),nativeFetch(new URL('demo.sqlite',base)).then(r=>r.arrayBuffer())]);
 function respond(data,status=200){return Response.json(data,{status});}
 async function dispatch(url,options){
  const [SQL,{createRoutes},{publicUser},seed]=await ready;
  const saved=localStorage.getItem(key);
  const db=new SQL.Database(saved?Uint8Array.from(atob(saved),c=>c.charCodeAt(0)):new Uint8Array(seed));
  try{
   const all=(sql,...args)=>{const stmt=db.prepare(sql);try{stmt.bind(args);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());return rows;}finally{stmt.free();}};
   const one=(sql,...args)=>all(sql,...args)[0];
   const run=(sql,...args)=>{db.run(sql,args);return {changes:db.getRowsModified(),lastInsertRowid:one('SELECT last_insert_rowid() id').id};};
   const transaction=fn=>{db.run('BEGIN');try{const value=fn();db.run('COMMIT');return value;}catch(e){db.run('ROLLBACK');throw e;}};
   const audit=(actor,action,entity,id,before,after)=>run('INSERT INTO audit(actor,action,entity,entity_id,before_json,after_json) VALUES(?,?,?,?,?,?)',actor,action,entity,id,JSON.stringify(before),JSON.stringify(after));
   const notify=(recipient,message)=>run('INSERT INTO notifications(recipient,message) VALUES(?,?)',recipient,message);
   const routes=createRoutes({db,all,one,run,transaction,audit,notify});
   const path=url.pathname,method=options.method||'GET',b=JSON.parse(options.body||'{}');
   const user=one('SELECT * FROM users WHERE login=?',sessionStorage.getItem(session)||'');
   if(path==='/api/login'){const u=one('SELECT * FROM users WHERE login=?',String(b.login).trim().toLowerCase());if(!u||b.password!=='Nova2026!')return respond({error:'Проверьте тестовый логин и пароль.'},401);sessionStorage.setItem(session,u.login);return respond({user:publicUser(u)});}
   if(path==='/api/logout'){sessionStorage.removeItem(session);return respond({ok:true});}
   if(path==='/api/session')return respond({user:user?publicUser(user):null});
   if(!user)return respond({error:'Выберите демоаккаунт.'},401);
   if(path==='/api/llm/status')return respond({ready:false});
   let result;
   if(path==='/api/chat'&&method==='POST'){
    result=routes.readAnswer(user,b.message)||{answer:'В браузерной версии доступны встроенные действия. Попробуйте «Покажи расписание» или «Что ты умеешь?». Свободный диалог с Ollama доступен в полной сборке.'};
    for(const [role,body] of [['user',b.message],['assistant',result.answer]])run('INSERT INTO chats(owner,role,body) VALUES(?,?,?)',user.login,role,body);
   }else if(path==='/api/chat')result={messages:all('SELECT role,body,created FROM chats WHERE owner=? ORDER BY id DESC LIMIT 40',user.login).reverse()};
   else result=routes.handle(method,path,user,b,url);
   if(result===undefined)return respond({error:'Раздел недоступен.'},404);
   if(method==='POST'){const bytes=db.export();let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));localStorage.setItem(key,btoa(binary));}
   return respond(result);
  }catch(e){return respond({error:e.message},e.status||500);}finally{db.close();}
 }
 window.fetch=(input,options={})=>{
  const url=new URL(input instanceof Request?input.url:input,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
  return navigator.locks?navigator.locks.request(key,()=>dispatch(url,options)):dispatch(url,options);
 };
})();
