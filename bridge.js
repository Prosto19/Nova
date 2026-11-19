(() => {
 const base=new URL('.',document.currentScript.src);
 const nativeFetch=window.fetch.bind(window);
 const key='nova-jury-db-v1',session='nova-jury-user';
 const ready=Promise.all([initSqlJs({locateFile:f=>new URL(f,base).href}),import(new URL('backend/routes.mjs',base)),import(new URL('backend/store.mjs',base)),nativeFetch(new URL('demo.sqlite',base)).then(r=>r.arrayBuffer())]);
 let activeWorker;
 let modelStatus='Загрузка языковой модели…';
 function showModelStatus(value){
  if(value===modelStatus)return;
  modelStatus=value;
  const hint=document.querySelector('.backend-model');
  if(hint)hint.textContent='NOVA · '+value;
 }
 try {
  const worker=new Worker(new URL('model-worker.js',base),{type:'module'});
  activeWorker=worker;
  const discard=()=>{if(activeWorker===worker){activeWorker=null;worker.terminate();showModelStatus('Загрузка прервана. Повторю при вопросе.');}};
  worker.onerror=discard;
  worker.onmessage=({data})=>{if(data.preloadFailed)discard();else if(data.ready)showModelStatus('Модель готова');else if(data.status)showModelStatus(data.status);};
  worker.postMessage({type:'preload'});
 } catch { showModelStatus('Модель не загрузилась. Повторю при вопросе.'); }
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
   if(path==='/api/llm/status')return respond({ready:modelStatus==='Модель готова',model:'Qwen2.5 · браузер',display:'NOVA · '+modelStatus});
   let result;
   if(path==='/api/chat'&&method==='POST'){
    if(completion && completion.owner!==user.login)return respond({error:'Сессия изменилась.'},401);
    if(typeof b.message!=='string'||!b.message.trim()||b.message.length>2000)return respond({error:'Введите вопрос длиной до 2000 символов.'},400);
    const question=b.message.replace(/^Спросить модель: /,'');
    const candidate=completion?null:routes.readAnswer(user,question);
    // For explanatory questions the model can use a tool result as context.
    // Keep permission checks and explicit workflows on the validated path.
    const explain=!candidate?.code && /^(?:расскажи|объясни|посоветуй|почему|зачем|как устроен|как работает|что такое|что ты умеешь|чем ты можешь помочь)/iu.test(question.trim());
    result=completion?{...completion.evidence,answer:completion.answer,source:'browser-model'}:explain?null:candidate;
    if(!result){
     if(/^(?:как тебя зовут|кто ты|привет(?:ик)?|здравствуй(?:те)?|доброе утро|добрый (?:день|вечер))[!.?\s]*$/iu.test(question.trim()))
      return {owner:user.login,messages:[
       {role:'system',content:'Ты NOVA, помощник деканата. Ответь по-русски одним коротким предложением.'},
       {role:'user',content:question}
      ]};
     const history=all('SELECT role,body FROM chats WHERE owner=? ORDER BY id DESC LIMIT 8',user.login).reverse();
     if(history[0]?.role==='assistant')history.shift();
     const ctx=routes.context(user,question);
     const role={student:'студента',teacher:'преподавателя',dean:'деканата'}[user.role];
     const functions=ctx.capabilities.map(c=>c.name).join(', ');
     const facts=Object.fromEntries(Object.entries(ctx).filter(([k])=>!['profile','note','capabilities'].includes(k)));
     const personal=/\b\d{4}-\d{2}-\d{2}\b|мо[йяиеёю]|меня|наш|сегодня|завтра|ближайш/i.test(question);
     const notes=candidate?JSON.stringify(candidate).slice(0,1400):personal&&Object.keys(facts).length?JSON.stringify(facts).slice(0,1400):'';
     const instruction='Ты NOVA, помощник деканата. Кабинет '+role+'. Отвечай кратко по-русски. Не придумывай данные или выполненные действия.'+(/сайт|умеешь|можешь|раздел|кабинет|вкладк|о себе/i.test(question)?' Возможности: '+functions:'')+(notes?' Данные: '+notes:'');
     const evidence=candidate?Object.fromEntries(['items','schedule','actions'].filter(k=>Array.isArray(candidate[k])).map(k=>[k,candidate[k]])):{};
     return {owner:user.login,evidence,messages:[
      {role:'system',content:instruction},
      ...history.map(m=>({role:m.role,content:m.body.slice(0,700)})),{role:'user',content:question.slice(0,2000)}]};
    }
    const details=[
     ...(result.schedule||[]).slice(0,6).map(l=>[l.day,l.start,l.subject,l.group_id,l.room].join(' · ')),
     ...(result.items||[]).slice(0,6).map(item=>[item.title,item.body].filter(Boolean).join(' · '))
    ];
    const transcript=[result.answer,...details].join('\n');
    for(const [role,body] of [['user',b.message],['assistant',transcript]])run('INSERT INTO chats(owner,role,body) VALUES(?,?,?)',user.login,role,body);
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
     let watchdog; const heartbeat=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>{showModelStatus("Модель не отвечает. Можно повторить вопрос.");finish(reject,Error("Движок не сообщил о прогрессе за 90 секунд."));},90000);};
     const finish=(fn,value)=>{clearTimeout(watchdog);if(fn===reject || activeWorker){worker.terminate();}else{activeWorker=worker;}worker.onmessage=null;worker.onerror=null;signal?.removeEventListener('abort',cancel);fn(value);};
     const cancel=()=>{showModelStatus('Ожидание отменено. Модель запустится при следующем вопросе.');finish(reject,new DOMException('Отменено','AbortError'));};
     signal?.addEventListener('abort',cancel,{once:true});
     const status=text=>{const el=document.querySelector('.nova-pending [role=status]');if(el){el.dataset.modelProgress="true";el.textContent=text;}};
     status('NOVA готовит модель к ответу…');
     worker.onmessage=({data})=>{
      heartbeat();if(data.status){if(data.status.startsWith('Загрузка модели · '))showModelStatus(data.status);else if(data.status==='NOVA формулирует ответ…')showModelStatus('Модель готова');status(data.status);}
      else if(data.error){showModelStatus('Модель недоступна. Можно повторить вопрос.');finish(reject,Error(data.error));}
      else if(typeof data.answer==='string')finish(resolve,data.answer);
     };
     worker.onerror=()=>{showModelStatus('Модель недоступна. Можно повторить вопрос.');finish(reject,Error('worker'));};
     heartbeat();worker.postMessage(result.messages);
    });
    return locked(()=>dispatch(url,options,{owner:result.owner,evidence:result.evidence,answer}));
   } catch(e){if(signal?.aborted)throw e;return respond({error:'Не удалось завершить ответ. '+e.message+' Можно повторить запрос.'},503);}
  });
 };
})();
