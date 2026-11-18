(() => {
 const base=new URL('.',document.currentScript.src);
 const nativeFetch=window.fetch.bind(window);
 const key='nova-jury-db-v1',session='nova-jury-user';
 const ready=Promise.all([initSqlJs({locateFile:f=>new URL(f,base).href}),import(new URL('backend/routes.mjs',base)),import(new URL('backend/store.mjs',base)),nativeFetch(new URL('demo.sqlite',base)).then(r=>r.arrayBuffer())]);
 let activeWorker;
 function respond(data,status=200){return Response.json(data,{status});}
 async function dispatch(url,options,completion){
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
   if(path==='/api/llm/status')return respond({ready:true,model:'Qwen2.5 · браузер'});
   let result;
   if(path==='/api/chat'&&method==='POST'){
    if(completion && completion.owner!==user.login)return respond({error:'Сессия изменилась.'},401);
    result=completion?{answer:completion.answer,source:'browser-model'}:routes.readAnswer(user,b.message);
    if(!result){
     const history=all('SELECT role,body FROM chats WHERE owner=? ORDER BY id DESC LIMIT 6',user.login).reverse();
     return {owner:user.login,messages:[
      {role:'system',content:'Ты NOVA, помощник университета. Отвечай по-русски кратко, учитывай диалог. Не выдумывай данные и не обещай выполненных действий. Доступный контекст: '+JSON.stringify(routes.context(user,b.message)).slice(0,2200)},
      ...history.map(m=>({role:m.role,content:m.body.slice(0,550)})),{role:'user',content:b.message.slice(0,1600)}]};
    }
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
  const locked = fn => navigator.locks ? navigator.locks.request(key,fn) : fn();
  return locked(()=>dispatch(url,options)).then(async result=>{
   if(result instanceof Response)return result;
   const signal=options.signal;
   signal?.throwIfAborted();
   try {
    const answer=await new Promise((resolve,reject)=>{
     const worker=activeWorker || new Worker(new URL('model-worker.js',base),{type:'module'});
     activeWorker=null;
     const finish=(fn,value)=>{if(fn===reject || activeWorker){worker.terminate();}else{activeWorker=worker;}worker.onmessage=null;worker.onerror=null;signal?.removeEventListener('abort',cancel);fn(value);};
     const cancel=()=>finish(reject,new DOMException('Отменено','AbortError'));
     signal?.addEventListener('abort',cancel,{once:true});
     const status=text=>{const el=document.querySelector('.nova-pending [role=status]');if(el){el.dataset.modelProgress="true";el.textContent=text;}};
     status('Первый запуск: загрузка модели (512 МБ). Можно отменить.');
     worker.onmessage=({data})=>{if(data.status)status(data.status);else if(data.error)finish(reject,Error(data.error));else finish(resolve,data.answer);};
     worker.onerror=()=>finish(reject,Error('worker'));
     worker.postMessage(result.messages);
    });
    return locked(()=>dispatch(url,options,{owner:result.owner,answer}));
   } catch(e){if(signal?.aborted)throw e;return respond({error:'Не удалось запустить языковую модель. Проверьте доступ к Hugging Face и повторите запрос. Расписание и другие учебные действия доступны.'},503);}
  });
 };
})();
