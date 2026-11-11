import test from 'node:test';
import assert from 'node:assert/strict';
import {comboMinimum,formatMultiple,minimumMultiple,payoutMultiple,readMultiple} from '../public/payout.mjs';
test('accepts app multiplier format and rejects cent strings and invalid input',()=>{
  for(const text of ['1.91×','1.91x',' 1.91 '])assert.equal(readMultiple(text),1.91);
  for(const text of ['52¢','abc','1','0',''])assert.equal(readMultiple(text),null);
});
test('payout target rounds conservatively and two-leg minimum is never below 2×',()=>{
  assert.equal(minimumMultiple(.45),2.23);
  assert.equal(comboMinimum(.62),2);
  assert.equal(comboMinimum(.45),2.23);
  assert.equal(comboMinimum(0),null);
  assert.equal(formatMultiple(payoutMultiple(.5)),'2.00×');
  assert.ok(readMultiple('1.91×')<comboMinimum(.62));
});
