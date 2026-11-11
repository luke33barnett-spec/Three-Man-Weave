import {readdir} from 'node:fs/promises';
import {read,save,key,ET} from './sources.mjs';
import {scoringInputs,fitPoints,pointsForecast} from './points-model.mjs';
import {simulate,distribution,usable,mid} from '../public/model.mjs';
import {dayInterval} from './calibration.mjs';
const boxes=await read('state/boxes-v2.json'), schedule=await read('state/schedule.json');
const games=new Map(Object.values(schedule).flat().filter(g=>g.completed).map(g=>[g.tag,g]));
const logs=new Map();
for(const r of Object.values(boxes).flat()){const a=logs.get(r.playerId)??[];a.push(r);logs.set(r.playerId,a);}
const inputs=new Map(), training=[];
const id=r=>r.playerId+'|'+r.gameId;
for(const history of logs.values())for(const r of history){
  const f=scoringInputs(history,r.start);
  if(f&&Number.isFinite(r.pts)){inputs.set(id(r),f);training.push({f,points:r.pts,available:Date.parse(r.availableAt)});}
}
const matches=[];
const files=(await readdir('state/candles')).filter(s=>/^\d{2}[A-Z]{3}\d{2}[A-Z0-9]+-\d+\.json$/.test(s));
for(const file of files){
  const [tag,lateStr]=file.slice(0,-5).split('-'), g=games.get(tag);
  if(!g||!boxes[g.id])continue;
  const late=Number(lateStr),early=Date.parse(g.start)/1000-90*60;
  if(late!==Date.parse(g.start)/1000-15*60)continue;
  const set=await read('state/candles/'+file), ranked=new Map(), ladder=new Map();
  for(const [i,ticker] of (set.market_tickers??[]).entries()){
    const m=new RegExp('^KXNBAPTS-'+tag+'-([A-Z0-9]+)-(\\d+)$').exec(ticker);
    if(!m)continue;
    const code=m[1].replace(/\d+$/,'').toLowerCase(), line=Number(m[2]);
    const players=boxes[g.id].filter(r=>{
      const words=r.name.trim().split(/\s+/);
      return code.slice(3)===key(words[0][0]+words.slice(1).join(''));
    });
    if(players.length!==1)continue;
    const r=players[0], f=inputs.get(id(r));
    if(!f)continue;
    const c=set.market_candlesticks?.[i]??[];
    const quote=t=>{
      const x=c.filter(v=>v.end_period_ts<=t&&v.end_period_ts>=t-20*60).sort((a,b)=>b.end_period_ts-a.end_period_ts)[0];
      if(!x)return null;
      return {bid:Number(x.yes_bid?.close_dollars),ask:Number(x.yes_ask?.close_dollars)};
    };
    const a=quote(early), b=quote(late);
    if(usable(b)&&b.ask-b.bid<=.100001){
      const group=ladder.get(r.playerId)??[];
      group.push({line,b});ladder.set(r.playerId,group);
    }
    if(!usable(a)||a.ask-a.bid>.100001)continue;
    const gap=Math.abs(mid(a)-.5), item={r,f,line,day:ET.format(new Date(g.start)),g,ticker,gap,b};
    const prior=ranked.get(r.playerId);
    if(!prior||gap<prior.gap||gap===prior.gap&&ticker<prior.ticker)ranked.set(r.playerId,item);
  }
  matches.push(...[...ranked.values()].filter(x=>usable(x.b)&&x.b.ask-x.b.bid<=.100001).map(x=>{
    const g=ladder.get(x.r.playerId)??[];
    const low=g.filter(v=>v.line<x.line).sort((a,b)=>b.line-a.line)[0];
    const high=g.filter(v=>v.line>x.line).sort((a,b)=>a.line-b.line)[0];
    if(!low||!high||low.line===high.line||mid(low.b)<mid(high.b))return x;
    const w=(x.line-low.line)/(high.line-low.line);
    return {...x,neighbor:(1-w)*mid(low.b)+w*mid(high.b)};
  }));
}
const days=[...new Set(matches.map(r=>r.day))].sort(),split=days[Math.floor(days.length*.6)];
const test=matches.filter(r=>r.day>=split), boundary=Math.min(...test.map(r=>Date.parse(r.g.start)));
const train=training.filter(r=>r.available<boundary), fit=fitPoints(train);
if(!fit||test.length<50)throw Error('Insufficient matched cached historical records');
const scores=test.map(x=>{
  const y=Number(x.r.pts>=x.line), forecast=pointsForecast(fit,x.f,x.line);
  const old=distribution(simulate(logs.get(x.r.playerId),x.g.start,null,x.ticker,1600),'pts',x.line);
  const market=mid(x.b), loss=p=>(p-y)**2;
  const side=forecast.yes-x.b.ask>(1-forecast.yes)-(1-x.b.bid);
  const price=side?x.b.ask:1-x.b.bid, prob=side?forecast.yes:1-forecast.yes;
  const gap=prob-price-.03;
  return {day:x.day,game:x.g.id,ticker:x.ticker,brier:loss(forecast.yes),old:loss(old.yes),market:loss(market),mae:Math.abs(forecast.mean-x.r.pts),oldMAE:Math.abs(old.mean-x.r.pts),
    neighbor:x.neighbor===undefined?null:loss(x.neighbor),gap,pnl:(side?y:1-y)-price-.03,paid:price+.03};
});
const avg=(rs,k)=>rs.reduce((s,r)=>s+r[k],0)/rs.length;
const gain=rs=>avg(rs,'market')-avg(rs,'brier');
const selected=new Map();
for(const r of scores.filter(r=>r.gap>=.03).sort((a,b)=>b.gap-a.gap||a.ticker.localeCompare(b.ticker)))if(!selected.has(r.game))selected.set(r.game,r);
const picks=[...selected.values()], pnl=picks.reduce((s,r)=>s+r.pnl,0), capital=picks.reduce((s,r)=>s+r.paid,0);
const neighbors=scores.filter(r=>r.neighbor!==null);
const neighborGain=rs=>avg(rs,'market')-avg(rs,'neighbor');
const report={protocol:'shot-volume-v1',fit:train.length,n:scores.length,split,testDays:new Set(scores.map(r=>r.day)).size,
  games:new Set(scores.map(r=>r.game)).size,baseline:avg(scores,'old'),market:avg(scores,'market'),challenger:avg(scores,'brier'),
  mae:avg(scores,'mae'),oldMAE:avg(scores,'oldMAE'),gain:gain(scores),ci:dayInterval(scores,gain),picks:picks.length,pnl,roi:capital?pnl/capital:null,stressPnl:pnl-.02*picks.length,
  neighbor:neighbors.length?{n:neighbors.length,market:avg(neighbors,'market'),brier:avg(neighbors,'neighbor'),gain:neighborGain(neighbors),ci:dayInterval(neighbors,neighborGain)}:null};
await save('public/data/points-study.json',report);
console.log(JSON.stringify(report,null,2));
