const engineBase=new URL('./runtime/',self.location.href).href;
const bytes=491400032, chunkSize=32*1024*1024;
let loading;

async function modelFile(){
  const cache=await self.caches?.open('nova-qwen-q4-9217f5d').catch(()=>null);
  const parts=[];
  let loaded=0;
  const count=Math.ceil(bytes/chunkSize);
  async function loadPart(i){
    const url=engineBase+'q4-'+i+'.bin';
    const expected=Math.min(chunkSize,bytes-i*chunkSize);
    let blob=await (await cache?.match(url).catch(()=>null))?.blob();
    if(blob?.size!==expected){
      let failure;
      for(let attempt=0;attempt<3;attempt++){
        try{
          const response=await fetch(url,{signal:AbortSignal.timeout(60000),cache:attempt?'reload':'default'});
          if(!response.ok)throw Error('HTTP '+response.status);
          blob=await response.blob();
          if(blob.size!==expected)throw Error('неполный файл');
          failure=null;break;
        }catch(error){failure=error;}
      }
      if(failure)throw Error('Не удалось загрузить часть '+(i+1)+' модели: '+failure.message);
      await cache?.put(url,new Response(blob)).catch(()=>{});
    }
    parts[i]=blob;loaded+=blob.size;
    self.postMessage({status:'Загрузка модели · '+Math.round(100*loaded/bytes)+' %'});
  }
  let next=0;
  async function consume(){while(next<count)await loadPart(next++);}
  await Promise.all(Array.from({length:4},consume));
  return new Blob(parts);
}

async function loadModel() {
  // Wllama resolves its nested worker's WASM URL against document.baseURI.
  // This module runs in a dedicated worker, whose equivalent base is location.href.
  self.document={baseURI:self.location.href};
  const {Wllama} = await import(engineBase + 'index.js');
  const model = new Wllama({'single-thread/wllama.wasm':engineBase+'single-thread/wllama.wasm'});
  const file=await modelFile();
  self.postMessage({status:'Запускаю модель на устройстве…'});
  await model.loadModel([file], {n_threads:1, n_ctx:4096, n_batch:128});
  return model;
}

self.onmessage = async ({data}) => {
  const preload = data?.type === 'preload';
  try {
    const model = await (loading ??= loadModel());
    if (preload) {self.postMessage({ready:true});return;}
    self.postMessage({status:'NOVA формулирует ответ…'});
    const messages=data.slice();
    while(messages.length>2){
      const prompt=await model.formatChat(messages,true);
      if((await model.tokenize(prompt,true)).length<=3800)break;
      messages.splice(1,2);
    }
    const answer = await model.createChatCompletion(messages, {
      nPredict:110, sampling:{temp:0.35,top_p:0.9}, useCache:true,
      onNewToken(_token,_piece,text){self.postMessage({status:text});}
    });
    if (!answer.trim()) throw Error('Пустой ответ модели');
    self.postMessage({answer:answer.trim()});
  } catch (error) {
    console.error('NOVA model:',error);
    self.postMessage(preload?{preloadFailed:true}:{error:String(error.message)});
  }
};
