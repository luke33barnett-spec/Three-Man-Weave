import test from 'node:test';
import assert from 'node:assert/strict';
import {lockSlate,gradeDecision,suggestCombo,candidate} from '../public/picks.mjs';
const at='2026-11-11T20:00:00Z';
const row=(gameId,threshold,ask,raw,extra={})=>({ticker:gameId+'-'+threshold,series:'KXNBAPTS',stat:'pts',
  gameId,game:gameId,player:'Example '+gameId,start:'2026-11-11T20:25:00Z',threshold,sample:16,projection:{yes:raw},
  quote:{at,bid:ask-.02,ask,depth:3,bidDepth:3},...extra});
test('singles require a reasonable entry price, sufficient sample and positive cost-adjusted gap',()=>{
  const r=row('g',20,.50,.80);
  assert.equal(candidate(r).side,'YES');
  assert.equal(candidate({...r,sample:8}),null);
  assert.equal(candidate({...r,projection:{yes:.50}}),null);
  assert.equal(candidate(row('g',20,.11,.5)),null);
});
test('decision freezes the first qualifying snapshot including passes',()=>{
  const r=row('g',20,.50,.80);
  const result=lockSlate([r,row('pass',20,.50,.50)],[],at);
  assert.deepEqual(result.map(p=>p.status),['pending','pass']);
  assert.deepEqual(lockSlate([r],result,at),result);
  assert.equal(lockSlate([{...r,start:'2026-11-11T20:02:00Z'}],[],at).length,0);
  const outcome=gradeDecision(result[0],{ticker:r.ticker,status:'settled',settlement_value_dollars:'.65'});
  assert.equal(outcome.status,'fractional');
  assert.ok(Math.abs(outcome.net-.13)<1e-9);
});
test('parlays choose lower thresholds from separate games and reserve a cost buffer',()=>{
  const rows=['g1','g2','g3'].flatMap(g=>[row(g,24,.51,.53),row(g,18,.66,.83)]);
  const c=suggestCombo(rows,3);
  assert.deepEqual(c.legs.map(l=>l.threshold),[18,18,18]);
  assert.equal(new Set(c.legs.map(l=>l.gameId)).size,3);
  assert.ok(c.ceiling<c.chance-.0499);
  assert.equal(suggestCombo(rows.slice(0,2),2),null);
});
