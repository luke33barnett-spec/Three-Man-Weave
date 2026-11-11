import {readdir} from 'node:fs/promises';
import {read,save,key,ET} from './sources.mjs';
import {suggestCombo} from '../public/picks.mjs';
import {simulate,distribution} from '../public/model.mjs';
import {dayInterval} from './calibration.mjs';
const boxes=await read('state/boxes-v2.json'), schedules=await read('state/schedule.json');
const games=new Map(Object.values(schedules).flat().filter(g=>g.completed).map(g=>[g.tag,g]));
const logs=new Map(), aliases=new Map();
for(const r of Object.values(boxes).flat()){
  const rows=logs.get(r.playerId)??[];rows.push(r);logs.set(r.playerId,rows);
  const words=r.name.trim().split(/\s+/);
  const alias=key(words[0][0]+words.slice(1).join(''));
  const ids=aliases.get(alias)??new Set();ids.add(r.playerId);aliases.set(alias,ids);
}
const fixtures=[], predictions=new Map();
for(const f of await readdir('state/candles')){
  if(!/^\d{2}[A-Z]{3}\d{2}[A-Z0-9]+-\d+\.json$/.test(f))continue;
  const [tag,stamp]=f.slice(0,-5).split('-'), g=games.get(tag);
  if(!g||!boxes[g.id]||+stamp!==Date.parse(g.start)/1000-15*60)continue;
  const history=await read('state/candles/'+f);
  const candidates=[];
  for(const [i,ticker] of (history.market_tickers??[]).entries()){
    const m=new RegExp('^KXNBAPTS-'+tag+'-([A-Z0-9]+)-(\\d+)$').exec(ticker);
    if(!m)continue;
    const a=m[1].replace(/\d+$/,'').slice(3).toLowerCase(), ids=aliases.get(a);
    if(ids?.size!==1)continue;
    const playerId=[...ids][0], threshold=Number(m[2]);
    candidates.push({ticker,playerId,threshold,candles:history.market_candlesticks?.[i]??[]});
  }
  fixtures.push({g,last:+stamp,candidates});
}
const tipWindows=[...new Set(fixtures.map(f=>f.last))].sort((a,b)=>a-b);
const policies=[12,8,6].map(minSample=>({minSample,grades:[],selectedDays:new Set(),excluded:0}));
const candidateDays=new Set(), quoteDays=new Set(), seasonDays=new Set(fixtures.map(f=>ET.format(new Date(f.g.start))));
for(const stamp of tipWindows){
  const at=new Date(stamp*1000).toISOString(), day=ET.format(new Date(at));
  if(policies.every(p=>p.selectedDays.has(day)))continue;
  const available=fixtures.filter(f=>f.last>=stamp&&f.last-stamp<=90*60);
  if(available.length<2)continue;
  candidateDays.add(day);
  const rows=[];
  for(const {g,candidates} of available)for(const {ticker,playerId,threshold,candles} of candidates){
    const c=candles.filter(x=>x.end_period_ts<=stamp&&x.end_period_ts>=stamp-20*60)
      .sort((a,b)=>b.end_period_ts-a.end_period_ts)[0];
    if(!c)continue;
    const k=g.id+'|'+playerId+'|'+at, log=logs.get(playerId);
    if(!predictions.has(k))predictions.set(k,simulate(log,at,null,k,4000));
    const s=predictions.get(k);
    if(!s)continue;
    rows.push({ticker,game:g.label,gameId:g.id,start:g.start,player:log[0].name,playerId,stat:'pts',threshold,sample:s.n,
      projection:distribution(s,'pts',threshold),quote:{at,bid:Number(c.yes_bid?.close_dollars),ask:Number(c.yes_ask?.close_dollars),depth:1}});
  }
  if(new Set(rows.map(r=>r.gameId)).size>=2)quoteDays.add(day);
  for(const policy of policies){
    if(policy.selectedDays.has(day))continue;
    const p=suggestCombo(rows,2,{minSample:policy.minSample});
    if(!p)continue;
    policy.selectedDays.add(day);
    const played=p.legs.map(l=>boxes[l.gameId].find(r=>r.playerId===l.playerId));
    if(played.some(r=>!r)){policy.excluded++;continue;}
    policy.grades.push({day,chance:p.chance,win:Number(p.legs.every((l,i)=>played[i].pts>=l.threshold))});
  }
}
const rate=rs=>rs.reduce((s,r)=>s+r.win,0)/rs.length;
const summarize=({grades,excluded,minSample})=>{
const hit=grades.length?rate(grades):null, expected=grades.length?grades.reduce((s,r)=>s+r.chance,0)/grades.length:null;
return {minSample,graded:grades.length,days:new Set(grades.map(r=>r.day)).size,excluded,hit,expected,interval:dayInterval(grades,rate),
  breakEven:hit>0?1/hit:null,at2x:hit===null?null:2*hit-1};
};
const report={rule:'One two-leg combo per day at the first qualifying common pregame snapshot',groups:tipWindows.length,
  cachedNights:seasonDays.size,overlapNights:candidateDays.size,quotedNights:quoteDays.size,
  ...summarize(policies[0]),sensitivity:policies.slice(1).map(summarize),hasComboQuotes:false};
await save('public/data/combo-study.json',report);
console.log(JSON.stringify(report,null,2));
