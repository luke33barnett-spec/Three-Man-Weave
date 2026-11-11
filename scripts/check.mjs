import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MARKETS} from '../public/model.mjs';
const j=JSON.parse(await readFile('public/data/board.json','utf8'));
assert(['live','demo'].includes(j.mode)&&Array.isArray(j.rows)&&Number.isFinite(Date.parse(j.at)));
for(const r of j.rows){
  assert(MARKETS[r.stat]&&Number.isInteger(r.threshold)&&Array.isArray(r.history));
  assert(!r.projection||(r.stat==='escalator'?(r.projection.expectedPayout>=0&&r.projection.expectedPayout<=1):(r.projection.yes>=0&&r.projection.yes<=1)));
  if(j.mode==='live')assert(Date.parse(r.quote.at)<Date.parse(r.start));
}
const html=await readFile('public/index.html','utf8');
for(const file of ['style.css','app.mjs','model.mjs'])await readFile('public/'+file);
assert(html.includes('app.mjs'));
console.log(j.mode+' board verified: '+j.rows.length+' contracts');
