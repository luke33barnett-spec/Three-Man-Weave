import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate,distribution,value,movement,compare,rotationShift,ladderChecks,scalarPayout,shotOpportunity} from '../public/model.mjs';
import {gamesFrom,normalize,parseBox} from '../scripts/sources.mjs';

const past={availableAt:'2026-11-10T01:00:00Z',min:30,pts:20,reb:9,ast:5,stl:2,blk:1,threes:3,tov:2};
test('simulation ignores unavailable observations and computes combos from joint draws',()=>{
  const asOf='2026-11-11T01:00:00Z', log=[...Array(6).fill(past),{...past,availableAt:asOf,pts:100}];
  const sim=simulate(log,asOf,null,'test',300);
  assert.equal(sim.n,6);
  for(const [market,n] of [['pts',20],['pr',29],['pa',25],['ra',14],['pra',34],['stocks',3],['threes',3]]){
    assert.equal(value(past,market),n);
    assert.equal(distribution(sim,market,n).yes,1);
    assert.equal(distribution(sim,market,n+1).yes,0);
  }
  assert.equal(simulate(log.slice(0,5),asOf,null,'test'),null);
});
const q=(at,bid,ask,volume)=>({at:'2026-11-11T'+at+':00Z',bid,ask,volume});
test('confirmation requires traded volume, elapsed time and narrow spreads',()=>{
  const a=q('16:00',.46,.50,100), b=q('16:30',.51,.55,160);
  assert.equal(movement([a,b]).confirmed,true);
  assert.equal(movement([a,{...b,volume:130}]).confirmed,false);
  assert.equal(movement([a,{...b,ask:.75}]).confirmed,false);
  assert.equal(movement([a,{...b,at:a.at}]).label,'Building history');
});
test('edge calculation uses ask and NO complement, with fees',()=>{
  const quote={bid:.4,ask:.45};
  const r=compare(.25,quote);
  assert.equal(r.side,'NO');
  assert.equal(r.cost,.6);
  assert.ok(Math.abs(r.gap-.13)<1e-9);
  assert.equal(compare(.6,{bid:0,ask:.4}),null);
});
test('schedule match is Eastern date and verified integer threshold; occurrence time is ignored',()=>{
  const start='2026-11-12T02:00:00Z', g=gamesFrom({events:[{id:'1',date:start,status:{type:{}},competitions:[{competitors:[{homeAway:'away',team:{abbreviation:'SA'}},{homeAway:'home',team:{abbreviation:'CHI'}}]}]}]});
  const m={event_ticker:'KXNBAPTS-26NOV11SASCHI',ticker:'sample',yes_sub_title:'Example: 20+',strike_type:'greater',floor_strike:19.5,market_type:'binary',rules_primary:'If Example records 20+ points in the game, then the market resolves to Yes.',occurrence_datetime:'2026-11-12T07:00:00Z'};
  assert.equal(normalize(m,'KXNBAPTS',g,null).game.start,start);
  assert.equal(normalize({...m,floor_strike:20},'KXNBAPTS',g,null),null);
  assert.equal(normalize(m,'KXNBAPTS',[...g,...g],null),null);
});
test('box parser distinguishes zero stats from missing and excludes DNP',()=>{
  const a={athlete:{id:'2',displayName:'Example'},stats:['30','20','9','5','0','1','3-7','2']};
  const j={boxscore:{players:[{statistics:[{keys:['minutes','points','rebounds','assists','steals','blocks','threePointFieldGoalsMade-threePointFieldGoalsAttempted','turnovers'],athletes:[a,{...a,didNotPlay:true},{...a,stats:a.stats.slice(0,-1)}]}]}]}};
  const rows=parseBox(j,{id:'1',start:'2026-11-10T01:00:00Z'});
  assert.equal(rows.length,1);assert.equal(rows[0].stl,0);assert.equal(rows[0].threes,3);
});
test('double- and triple-doubles count steals and blocks but not threes',()=>{
  const g={...past,reb:10,blk:10,threes:10};
  assert.equal(value(g,'dd'),1);assert.equal(value(g,'td'),1);
  assert.equal(value({...g,blk:9},'td'),0);
  assert.equal(distribution({samples:[g]},'leader',1),null);
});
test('rotation compares non-overlapping played games known at forecast time',()=>{
  const log=Array.from({length:11},(_,i)=>({...past,min:i<3?36:28,availableAt:new Date(Date.UTC(2026,10,10-i)).toISOString()}));
  assert.equal(rotationShift([...log,{...past,min:55,availableAt:'2026-11-12T01:00:00Z'}],'2026-11-11T01:00:00Z'),8);
  assert.equal(rotationShift(log.slice(1),'2026-11-11T01:00:00Z'),null);
});
test('threshold check requires identical event, two sizes and positive margin after cost',()=>{
  const a={stat:'pts',series:'S',player:'P',game:'A @ B',start:'tip',threshold:20,quote:{at:'t',bid:.38,ask:.40,depth:5,bidDepth:5}};
  const b={...a,threshold:25,quote:{...a.quote,bid:.48,ask:.50}};
  assert.equal(ladderChecks([a,b]).length,1);
  assert.equal(ladderChecks([a,{...b,game:'C @ D'}]).length,0);
  assert.equal(ladderChecks([a,{...b,quote:{...b.quote,bidDepth:0}}]).length,0);
});
test('scalar points payout uses the actual stepped curve, not the hit rate or mean score',()=>{
  const rules={floor:0,cap:50,step:2,exponent:3};
  assert.equal(scalarPayout(31,rules),.216);
  assert.equal(scalarPayout(51,rules),1);
  assert.ok(Math.abs(distribution({samples:[{pts:20},{pts:40}]},'escalator',0,rules).expectedPayout-.288)<1e-9);
});
test('shot opportunity normalizes for minutes and excludes records not known yet',()=>{
  const log=Array.from({length:11},(_,i)=>({...past,min:i<3?36:24,fga:i<3?18:12,fta:0,availableAt:new Date(Date.UTC(2026,10,10-i)).toISOString()}));
  assert.equal(shotOpportunity(log,'2026-11-11T01:00:00Z').shift,0);
  log[0].fga=24;
  assert.ok(Math.abs(shotOpportunity(log,'2026-11-11T01:00:00Z').shift-2)<1e-9);
  assert.equal(shotOpportunity(log.slice(0,10),'2026-11-11T01:00:00Z'),null);
});
