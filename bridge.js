(() => {
 const base=new URL('.',document.currentScript.src);
 const nativeFetch=window.fetch.bind(window);
 const key='nova-jury-db-v1',session='nova-jury-user';
 const ready=Promise.all([initSqlJs({locateFile:f=>new URL(f,base).href}),import(new URL('backend/routes.mjs',base)),import(new URL('backend/store.mjs',base)),nativeFetch(new URL('demo.sqlite',base)).then(r=>r.arrayBuffer())]);
 let activeWorker;
 try {
  const worker=new Worker(new URL('model-worker.js',base),{type:'module'});
  activeWorker=worker;
  const discard=()=>{if(activeWorker===worker){activeWorker=null;worker.terminate();}};
  worker.onerror=discard;
  worker.onmessage=({data})=>{if(data.preloadFailed)discard();};
  worker.postMessage({type:'preload'});
 } catch { /* A chat request can retry if startup was blocked. */ }
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
    if(typeof b.message!=='string'||!b.message.trim()||b.message.length>2000)return respond({error:'Введите вопрос длиной до 2000 символов.'},400);
    const modelPrefix='Спросить модель: ';
    const askModel=b.message.startsWith(modelPrefix);
    result=completion?{answer:completion.answer,source:'browser-model'}:askModel?null:routes.readAnswer(user,b.message);
    if(!result&&!askModel){
     result={source:'workflow',answer:'У меня пока нет проверенного ответа на этот вопрос. Могу показать, с чем помогу в вашем кабинете. Если нужен свободный ответ, можно отдельно спросить языковую модель.',actions:[{id:'agent-prompt',label:'Мои возможности',prompt:'Что ты умеешь?'}]};
     if(b.message.length+modelPrefix.length<=2000)result.actions.push({id:'agent-prompt',label:'Спросить модель',prompt:modelPrefix+b.message});
    }
    if(!result){
     const question=b.message.slice(modelPrefix.length);
     const history=all('SELECT role,body FROM chats WHERE owner=? ORDER BY id DESC LIMIT 6',user.login).reverse();
     if(history.at(-1)?.body.startsWith('У меня пока нет проверенного ответа')&&history.at(-2)?.body===question)history.splice(-2);
     if(history[0]?.role==='assistant')history.shift();
     return {owner:user.login,messages:[
      {role:'system',content:'Ты NOVA, помощник университета. Ответь на последний вопрос по-русски в двух-трёх предложениях. Если не знаешь, скажи об этом. Не обещай выполненных действий.'},
      ...history.map(m=>({role:m.role,content:m.body.slice(0,550)})),{role:'user',content:question.slice(0,1600)}]};
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
     status('NOVA готовит модель к ответу…');
     worker.onmessage=({data})=>{if(data.status)status(data.status);else if(data.error)finish(reject,Error(data.error));else if(typeof data.answer==='string')finish(resolve,data.answer);};
     worker.onerror=()=>finish(reject,Error('worker'));
     worker.postMessage(result.messages);
    });
    return locked(()=>dispatch(url,options,{owner:result.owner,answer}));
   } catch(e){if(signal?.aborted)throw e;return respond({error:'Не удалось запустить языковую модель. Проверьте доступ к Hugging Face и повторите запрос. Расписание и другие учебные действия доступны.'},503);}
  });
 };
})();
