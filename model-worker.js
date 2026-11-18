const engineBase = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.6/esm/';
const weights = 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf';
let loading;

async function modelFile() {
  const cache=await caches.open('nova-weights-v1').catch(()=>null);
  const saved=await cache?.match(weights).catch(()=>null);
  if(saved)return saved.blob();
  const response=await fetch(weights);
  if(!response.ok)throw Error('Не удалось загрузить модель: '+response.status);
  let loaded=0, previous=-1;
  const progress=new TransformStream({transform(chunk,controller){
    loaded+=chunk.byteLength;
    const percent=Math.min(100,Math.floor(100*loaded/1117320736));
    if(percent!==previous){self.postMessage({status:'Загрузка модели · '+percent+' %'});previous=percent;}
    controller.enqueue(chunk);
  }});
  const blob=await new Response(response.body.pipeThrough(progress)).blob();
  // The model can run from this blob even when persistent storage is full.
  if(cache)void cache.put(weights,new Response(blob)).catch(()=>{});
  return blob;
}

async function loadModel() {
  // Wllama resolves its nested worker's WASM URL against document.baseURI.
  // This module runs in a dedicated worker, whose equivalent base is location.href.
  self.document={baseURI:self.location.href};
  const {Wllama} = await import(engineBase + 'index.js');
  const model = new Wllama({'single-thread/wllama.wasm':engineBase+'single-thread/wllama.wasm'});
  await model.loadModel([await modelFile()], {n_threads:1, n_ctx:4096, n_batch:128});
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
      nPredict:220, sampling:{temp:0.35,top_p:0.9}, useCache:true,
      onNewToken(_token,_piece,text){self.postMessage({status:text});}
    });
    if (!answer.trim()) throw Error('Пустой ответ модели');
    self.postMessage({answer:answer.trim()});
  } catch (error) {
    console.error('NOVA model:',error);
    self.postMessage(preload?{preloadFailed:true}:{error:String(error.message)});
  }
};
