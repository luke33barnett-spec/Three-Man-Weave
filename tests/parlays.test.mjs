import test from 'node:test';
import assert from 'node:assert/strict';
import {parlayIdeas,lockParlays,gradeParlays} from '../public/parlays.mjs';
const at='2026-11-11T23:00:00Z';
const make=(gameId,stat,overrides={})=>({ticker:gameId+'-'+stat,gameId,game:gameId,stat,player:'Player '+gameId,
  threshold:5,start:'2026-11-12T00:00:00Z',sample:20,projection:{yes:.82},
  quote:{at,bid:.64,ask:.67,depth:10,bidDepth:10},...overrides});
test('suggests distinct binary props across games with a 2× floor',()=>{
  const p=parlayIdeas([make('A','reb'),make('A','pts'),make('B','ast'),make('C','threes'),make('D','escalator')]);
  assert.ok(p.length>1);
  assert.ok(p.every(x=>x.legs.length===2&&x.minimum>=2&&x.legs[0].gameId!==x.legs[1].gameId));
  assert.ok(p.every(x=>x.legs.every(l=>l.stat!=='escalator')));
  assert.equal(new Set(p.map(x=>x.id)).size,p.length);
});
test('one nightly lock and correct settlement including partial payouts',()=>{
  const rows=[make('A','reb'),make('B','ast')];
  const locked=lockParlays(rows,[],at);
  assert.equal(locked.length,1);assert.equal(locked[0].ideas[0].status,'pending');
  assert.deepEqual(lockParlays(rows,locked,at),locked);
  const markets=new Map(rows.map((r,i)=>[r.ticker,{status:'settled',settlement_value_dollars:i?'.60':'1'}]));
  const graded=gradeParlays(locked,markets);
  assert.equal(graded[0].ideas[0].status,'fractional');
  assert.equal(graded[0].ideas[0].payout,.6);
  const lost=gradeParlays(locked,new Map([[rows[0].ticker,{status:'settled',result:'no'}]]));
  assert.equal(lost[0].ideas[0].status,'loss');
});
