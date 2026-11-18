"""Render NOVA's approved Albina voice with the locally cached Silero CIS Base model."""
import re
import wave
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
RATE = 24000


def load_voice():
    torch.set_num_threads(4)
    with (ROOT / '.voice-cache/v5_cis_base_nostress.pt').open('rb') as weights:
        return torch.package.PackageImporter(weights).load_pickle('tts_models', 'model')


def render(model, text, path):
    chunks = []
    for sentence in re.split(r'(?<=[.!?])\s+', text):
        lift = ' pitch="+3%"' if sentence.endswith(('!', '?')) else ''
        phrase = sentence.replace(' — ', '<break time="95ms"/>')
        audio = model.apply_tts(ssml_text=f'<speak><prosody rate="100%"{lift}>{phrase}</prosody></speak>',
                                speaker='ru_albina', sample_rate=RATE, put_accent=False).numpy()
        active = np.flatnonzero(abs(audio) > .002)
        if not len(active):
            raise ValueError(f'Empty voice clip: {path}')
        chunks.append(audio[max(0, active[0]-960):active[-1]+1680])
        chunks.append(np.zeros(round(.18*RATE), dtype=np.float32))
    audio = np.concatenate(chunks)
    with wave.open(str(path), 'wb') as out:
        out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        out.writeframes(np.rint(np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
