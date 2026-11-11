import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPoints,pointsForecast,scoringInputs} from '../scripts/points-model.mjs';
test('independent points forecast ignores future stat lines and respects increasing thresholds',()=>{
  const asOf='2026-11-11T19:00:00Z';
  const base={min:32,pts:22,fga:17,fta:3,availableAt:'2026-11-10T04:00:00Z'};
  const f=scoringInputs(Array(8).fill(base),asOf);
  assert.deepEqual(scoringInputs([...Array(8).fill(base),{...base,pts:99,availableAt:asOf}],asOf),f);
  const examples=Array.from({length:75},(_,i)=>({f,points:18+i%9}));
  const fit=fitPoints(examples);
  assert.ok(pointsForecast(fit,f,20).yes>pointsForecast(fit,f,24).yes);
});
