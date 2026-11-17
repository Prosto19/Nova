import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('dean tour demonstrates every section and explains manual controls without overstating demo',async()=>{
 const ctx={};vm.runInNewContext(await readFile(new URL('../public/roles.js',import.meta.url),'utf8'),ctx);
 const role=ctx.NOVA_ROLES.dean;
 for(const [id,,title] of role.sections){assert.ok(role.tour.some(s=>s.target===id&&s.section===title),title);}
 assert.ok(role.tour.some(s=>s.target==='manual'&&s.text.includes('вручную')));
 for(const target of ['chat','suggestions','events','profile-card'])assert.ok(role.tour.some(s=>s.target===target));
 assert.equal(new Set(role.tour.map(s=>s.audio)).size,role.tour.length);
 assert.ok(role.tour.at(-1).text.includes('сохраняются'));
});
