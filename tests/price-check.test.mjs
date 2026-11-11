import assert from 'node:assert/strict';
import test from 'node:test';
import {checkThresholds} from '../public/price-check.mjs';
const row=(threshold,bid,ask,extra={})=>({
  ticker:'TEST-'+threshold,stat:'pts',series:'KXNBAPTS',player:'Example',game:'A @ B',start:'tip',threshold,
  quote:{at:'snapshot',bid,ask,depth:3,bidDepth:3,...extra}
});
test('cheaper NO at the higher threshold covers every outcome of the lower NO',()=>{
  const x=checkThresholds([row(10,.57,.60),row(15,.65,.68)]);
  const hit=x.dominated.find(x=>x.from.side==='NO');
  assert.equal(hit.from.row.threshold,10);
  assert.equal(hit.to.row.threshold,15);
  assert.equal(hit.saving,.08);
  for(let score=0;score<=65;score++)assert.ok(Number(score<15)>=Number(score<10));
});
test('cheaper YES at a lower threshold requires matching data and displayed size',()=>{
  const a=row(20,.42,.45), b=row(25,.47,.51);
  assert.equal(checkThresholds([a,b]).dominated.find(x=>x.from.side==='YES').saving,.06);
  assert.equal(checkThresholds([row(20,.42,.45,{depth:0}),b]).dominated.filter(x=>x.from.side==='YES').length,0);
  assert.equal(checkThresholds([a,{...b,quote:{...b.quote,at:'later'}}]).dominated.length,0);
  assert.equal(checkThresholds([a,{...b,series:'protected'}]).dominated.length,0);
});
test('two-leg check uses the ask and bid complement, including costs',()=>{
  const a=row(20,.37,.40),b=row(25,.49,.51);
  assert.equal(checkThresholds([a,b]).pairs[0].cost,.97);
  assert.equal(checkThresholds([a,b],{pairCosts:.10}).pairs.length,0);
  for(let score=0;score<=65;score++)assert.ok(Number(score>=20)+Number(score<25)>=1);
});
