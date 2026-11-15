"""Offline generation: pip install torch numpy. Model is Silero v5 CIS Base (MIT)."""
import pathlib, wave, json
import torch
root = pathlib.Path(__file__).resolve().parent.parent
torch.set_num_threads(4)
model = torch.package.PackageImporter(open(root/'.voice-cache/v5_cis_base_nostress.pt','rb')).load_pickle('tts_models','model')
print(model.speakers, flush=True)
lines = [
 'Прив+ет! Я Н+ова, твой пом+ощник в университ+ете. Р+ада знак+омству! Дав+ай покаж+у, где найт+и с+амое в+ажное.',
 'Здесь м+ожно общ+аться со мной. Напиш+и свой вопр+ос, наприм+ер: как+ие п+ары у мен+я сег+одня?',
 'В распис+ании ты найдёшь сво+и з+анятия, вр+емя и аудит+ории. Всё, что н+ужно для уч+ебного дня.',
 'В разд+еле успев+аемости б+удут тво+и оц+енки и результ+аты по дисципл+инам. Так уд+обно сл+едить за сво+ими усп+ехами.',
 'А здесь — экз+амены и зачёты. Их д+аты и в+ажная информ+ация, чт+обы ты мог подгот+овиться зар+анее.',
 'Нужн+а спр+авка или заявл+ение? Откр+ой +этот разд+ел. Здесь м+ожно б+удет оф+ормить запр+ос и пров+ерить ег+о ст+атус.',
 'Это твой пр+офиль. Здесь собран+ы уч+ебные д+анные: гр+уппа, направл+ение, курс и факульт+ет. Ты всегд+а м+ожешь к ним верн+уться.',
 'Теп+ерь ты зн+аешь, где что нах+одится. Р+ада быть р+ядом! Начнём?'
]
out=root/'public/audio'; out.mkdir(exist_ok=True)
for i,text in enumerate(lines):
 audio=model.apply_tts(text=text,speaker='ru_ekaterina',sample_rate=24000)
 data=(audio.cpu().numpy().clip(-1,1)*32767).astype('<i2')
 with wave.open(str(out/f'tour-{i}.wav'),'wb') as f:
  f.setnchannels(1); f.setsampwidth(2); f.setframerate(24000); f.writeframes(data.tobytes())
 print(i,round(len(data)/24000,2),flush=True)
 (out/'captions.json').write_text(json.dumps([x.replace('+','') for x in lines],ensure_ascii=False,indent=2),encoding='utf-8')



