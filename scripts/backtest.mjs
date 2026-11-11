import {K,ET,get,schedule,list,normalize,pool,save,read,loadLogs,playerLog} from './sources.mjs';
import {mid,usable,compare,simulate,distribution,rotationShift,shotOpportunity} from '../public/model.mjs';
import {evaluateCalibration,evaluateRole} from './calibration.mjs';
// Fixed protocol v1; no outcome-informed tuning. Recent sample is exploratory.
const today=Date.now(), days=Number(process.env.BACKTEST_DAYS??26);
if(!Number.isInteger(days)||days<1||days>30)throw Error('BACKTEST_DAYS must be 1–30');
const since=today-days*86400000, from=ET.format(new Date(since)), to=ET.format(new Date(today));
const series='KXNBAPTS', games=(await schedule(from,to)).filter(g=>g.completed&&Date.parse(g.start)>=since);
const listing=await list(series,'settled',20,{min_settled_ts:Math.floor(since/1000)});
if(listing.truncated)throw Error('Market pagination cap reached; shorten the window');
const matched=listing.markets.map(m=>normalize(m,series,games,null)).filter(Boolean);
// Require market open by the first observation. Later-listed contracts never enter the cohort.
const universe=matched.filter(m=>Date.parse(m.opened)<=Date.parse(m.game.start)-90*60000);
const jobs=[];
for(const g of games){
  const a=universe.filter(m=>m.game.id===g.id);
  if(a.length)jobs.push({g,markets:a});
}
const candidates=(await pool(jobs,2,async ({g,markets})=>{
  const tip=Date.parse(g.start)/1000, early=tip-90*60, late=tip-15*60;
  const cache='state/candles/'+g.tag+'-'+late+'.json';
  let j=await read(cache,null);
  if(!j){
    j=await get(K,'/series/'+series+'/events/'+series+'-'+g.tag+'/candlesticks',{start_ts:early-30*60,end_ts:late,period_interval:1});
    await save(cache,j);
  }
  if(!Array.isArray(j.market_tickers)||!Array.isArray(j.market_candlesticks))throw Error('Candle format changed');
  const seriesByTicker=new Map(j.market_tickers.map((t,i)=>[t,j.market_candlesticks[i]]));
  return markets.flatMap(m=>{
    const candles=(seriesByTicker.get(m.ticker)??[]).sort((a,b)=>a.end_period_ts-b.end_period_ts);
    const at=t=>{
      const c=candles.filter(c=>c.end_period_ts<=t).at(-1);
      if(!c||c.end_period_ts<t-20*60)return null;
      return {bid:Number(c.yes_bid?.close_dollars),ask:Number(c.yes_ask?.close_dollars),ts:c.end_period_ts};
    };
    const a=at(early),b=at(late);
    if(!usable(a)||a.ask-a.bid>.100001)return [];
    if(!usable(b)||b.ask-b.bid>.100001)return [{...m,a,b:null}];
    const delta=mid(b)-mid(a), volume=candles.filter(c=>c.end_period_ts>a.ts&&c.end_period_ts<=b.ts).reduce((s,c)=>s+(Number(c.volume_fp)||0),0);
    return [{...m,a,b,delta,volume}];
  });
})).flat();
const chosen=new Map();
// Choose one threshold at T−90 before checking whether a later quote exists.
for(const row of candidates.sort((a,b)=>Math.abs(mid(a.a)-.5)-Math.abs(mid(b.a)-.5)||a.ticker.localeCompare(b.ticker))){
  const id=row.game.id+'|'+row.player;
  if(!chosen.has(id))chosen.set(id,row);
}
const training=await schedule(ET.format(new Date(since-24*86400000)),to);
const {logs,failed}=await loadLogs(training);
const paired=[...chosen.values()].filter(r=>r.b);
const observations=paired.filter(r=>['yes','no'].includes(r.result)&&(r.settlement===null||r.settlement===Number(r.result==='yes'))).map(r=>{
  const y=Number(r.result==='yes'), p0=mid(r.a), p1=mid(r.b);
  const confirmed=Math.abs(r.delta)>=.039999&&r.volume>=50;
  const p2=confirmed?Math.min(.99,Math.max(.01,p1+.5*r.delta)):p1;
  const paper=compare(p2,r.b);
  const selected=confirmed&&paper.gap>=.02;
  const payoff=paper.side==='YES'?y:1-y;
  const asOf=new Date(Date.parse(r.game.start)-15*60000).toISOString();
  const log=playerLog(logs,r.player);
  const sim=simulate(log,asOf,null,r.ticker,4000);
  const model=distribution(sim,'pts',r.threshold)?.yes??null;
  const blend=model===null?null:.75*p1+.25*model;
  const blendMove=blend===null?null:Math.min(.99,Math.max(.01,blend+p2-p1));
  return {game:r.game.id,day:ET.format(new Date(r.game.start)),confirmed,
    y,p1,modelProb:model,role:rotationShift(log,asOf),usage:shotOpportunity(log,asOf)?.shift??null,bid:r.b.bid,ask:r.b.ask,
    early:(p0-y)**2,late:(p1-y)**2,signal:(p2-y)**2,
    model:model===null?null:(model-y)**2,blend:blend===null?null:(blend-y)**2,blendMove:blendMove===null?null:(blendMove-y)**2,
    selected,pnl:selected?payoff-paper.cost-.02:0,capital:selected?paper.cost+.02:0};
});
function metrics(rows){
  const n=rows.length, average=k=>n?rows.reduce((s,r)=>s+r[k],0)/n:null;
  const trades=rows.filter(r=>r.selected), pnl=trades.reduce((s,r)=>s+r.pnl,0), cost=trades.reduce((s,r)=>s+r.capital,0);
  const dates=[...new Set(rows.map(r=>r.day))], groups=dates.map(d=>rows.filter(r=>r.day===d));
  let ci=null;
  if(groups.length>=5){
    let seed=9291;const rng=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
    const draws=Array.from({length:1500},()=>{
      const sample=groups.flatMap(()=>groups[Math.floor(rng()*groups.length)]);
      return sample.reduce((s,r)=>s+r.late-r.signal,0)/sample.length;
    }).sort((a,b)=>a-b);
    ci=[draws[37],draws[1462]];
  }
  return {n,games:new Set(rows.map(r=>r.game)).size,days:dates.length,confirmed:rows.filter(r=>r.confirmed).length,early:average('early'),late:average('late'),signal:average('signal'),increment:n?average('late')-average('signal'):null,ci,trades:trades.length,pnl,roi:cost?pnl/cost:null,stressPnl:pnl-.01*trades.length};
}
const modelRows=observations.filter(r=>r.model!==null);
const modelComparison=Object.fromEntries(['late','model','blend','blendMove'].map(k=>[k,modelRows.length?modelRows.reduce((a,r)=>a+r[k],0)/modelRows.length:null]));
const inputs=observations.map(r=>({...r,model:r.modelProb}));
const calibration=evaluateCalibration(inputs);
const role=evaluateRole(inputs,calibration.split);
const usage=evaluateRole(inputs,calibration.split,true);
const report={at:new Date().toISOString(),from,to,series,protocol:'v4',sample:'Exploratory historical replay',listed:listing.markets.length,matched:matched.length,earlyOpen:universe.length,paired:paired.length,distinct:chosen.size,failedBoxes:failed,all:metrics(observations),signalOnly:metrics(observations.filter(r=>r.confirmed)),model:{n:modelRows.length,...modelComparison},calibration,role,usage};
await save('public/data/research.json',report);
console.log(JSON.stringify(report,null,2));
