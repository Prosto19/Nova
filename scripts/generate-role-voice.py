import pathlib,json,wave,torch,sys,re
root=pathlib.Path(__file__).resolve().parent.parent
data=(root/'public/roles.js').read_text(encoding='utf-8').split(' = ',1)[1].rstrip(';\n')
roles=json.loads(data)
torch.set_num_threads(4)
model=torch.package.PackageImporter(open(root/'.voice-cache/v5_cis_base_nostress.pt','rb')).load_pickle('tts_models','model')
for role in (sys.argv[1:] or ['teacher','dean']):
 for step in roles[role]['tour']:
  parts=re.split(r'(?<=[.!?])\s+',step['speech']) if role=='dean' else [step['speech']]
  chunks=[]
  for part in parts:
   chunks.append(model.apply_tts(text=part,speaker='ru_ekaterina',sample_rate=24000))
   if role=='dean': chunks.append(torch.zeros(9600))
  audio=torch.cat(chunks)
  pcm=(audio.cpu().numpy().clip(-1,1)*32767).astype('<i2')
  with wave.open(str(root/'public/audio'/f"{step['audio']}.wav"),'wb') as f:
   f.setnchannels(1);f.setsampwidth(2);f.setframerate(24000);f.writeframes(pcm.tobytes())
  print(step['audio'],round(len(pcm)/24000,2),flush=True)
