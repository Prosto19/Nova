import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('every tour caption has a valid, nonempty speech clip in the local application',async()=>{
 const captions=JSON.parse(await readFile(new URL('../public/audio/captions.json',import.meta.url),'utf8'));
 assert.equal(captions.length,8);
 for(let i=0;i<captions.length;i++){
  const file=await readFile(new URL(`../public/audio/tour-${i}.wav`,import.meta.url));
  assert.equal(file.toString('ascii',0,4),'RIFF');assert.equal(file.toString('ascii',8,12),'WAVE');
  assert.equal(file.readUInt16LE(22),1);assert.equal(file.readUInt32LE(24),24000);
  assert.ok(file.length>48000,`clip ${i} should contain more than one second of speech`);
 }
});
