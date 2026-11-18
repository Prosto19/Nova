let generator, Streamer;
self.onmessage = async ({data: messages}) => {
  try {
    if (!generator) {
      const {pipeline, env, TextStreamer} = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js');
      Streamer=TextStreamer;
      env.allowLocalModels = false;
      env.backends.onnx.wasm.numThreads = 1;
      generator = await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', {
        device: 'wasm', dtype: 'int8', revision: '22942cb7d7ba4cc81bb4673549ca4d4614469b5e',
        progress_callback(event) {
          if (event.status === 'progress' && event.file.endsWith('.onnx'))
            self.postMessage({status:'Загрузка модели · '+Math.min(100,Math.round(100*event.loaded/512096557))+' %'});
        }
      });
    }
    self.postMessage({status:'NOVA формулирует ответ…'});
    let partial='';
    const streamer=new Streamer(generator.tokenizer,{skip_prompt:true,skip_special_tokens:true,callback_function(text){partial+=text;self.postMessage({status:partial});}});
    const output = await generator(messages, {streamer,max_new_tokens:128, do_sample:false, repetition_penalty:1.12,return_full_text:false});
    const generated=output[0].generated_text;
    const answer=Array.isArray(generated)?generated.at(-1)?.content:generated;
    if (typeof answer !== 'string' || !answer.trim()) throw Error('empty answer');
    self.postMessage({answer:answer.trim()});
  } catch (error) { console.error('NOVA model:',error); self.postMessage({error:String(error.message)}); }
};
