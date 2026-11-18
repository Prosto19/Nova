from nova_voice import ROOT as root, load_voice, render
import json, sys
data=(root/'public/roles.js').read_text(encoding='utf-8').split(' = ',1)[1].rstrip(';\n')
roles=json.loads(data)
model=load_voice()
for role in (sys.argv[1:] or ['teacher','dean']):
 for step in roles[role]['tour']:
  render(model,step['speech'],root/'public/audio'/f"{step['audio']}.wav")
