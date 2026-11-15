import pathlib,json,wave,torch
root=pathlib.Path(__file__).resolve().parent.parent
data=(root/'public/roles.js').read_text(encoding='utf-8').split(' = ',1)[1].rstrip(';\n')
roles=json.loads(data)
torch.set_num_threads(4)
model=torch.package.PackageImporter(open(root/'.voice-cache/v5_cis_base_nostress.pt','rb')).load_pickle('tts_models','model')
for role in ['teacher','dean']:
 for step in roles[role]['tour']:
  audio=model.apply_tts(text=step['speech'],speaker='ru_ekaterina',sample_rate=24000)
  pcm=(audio.cpu().numpy().clip(-1,1)*32767).astype('<i2')
  with wave.open(str(root/'public/audio'/f"{step['audio']}.wav"),'wb') as f:
   f.setnchannels(1);f.setsampwidth(2);f.setframerate(24000);f.writeframes(pcm.tobytes())
  print(step['audio'],round(len(pcm)/24000,2),flush=True)
