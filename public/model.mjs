export const MARKETS = {
  pts:['Points','PTS'], ast:['Assists','AST'], reb:['Rebounds','REB'], threes:['Made threes','3PM'],
  stl:['Steals','STL'], blk:['Blocks','BLK'], dd:['Double-double','DD'], td:['Triple-double','TD'],
  leader:['Game points leader','PTS LEADER'], pra:['Points + Rebounds + Assists','PRA'],
  escalator:['Points escalator','ESCALATORS']
};
const stats = ['pts','reb','ast','stl','blk','threes','tov'];
export function rotationShift(log,asOf){
  const available=log.filter(g=>g.min>0&&Date.parse(g.availableAt)<Date.parse(asOf))
    .sort((a,b)=>Date.parse(b.availableAt)-Date.parse(a.availableAt));
  if(available.length<11)return null;
  const avg=rs=>rs.reduce((s,r)=>s+r.min,0)/rs.length;
  return avg(available.slice(0,3))-avg(available.slice(3,11));
}
export function shotOpportunity(log,asOf){
  const g=log.filter(r=>r.min>0&&Number.isFinite(r.fga)&&Number.isFinite(r.fta)&&Date.parse(r.availableAt)<Date.parse(asOf))
    .sort((a,b)=>Date.parse(b.availableAt)-Date.parse(a.availableAt));
  if(g.length<11)return null;
  const rate=rs=>rs.reduce((s,r)=>s+r.fga+.44*r.fta,0)/rs.reduce((s,r)=>s+r.min,0);
  const recent=g.slice(0,3), prior=g.slice(3,11), minutes=recent.reduce((s,r)=>s+r.min,0)/3;
  return {perMinute:rate(recent),expected:minutes*rate(recent),shift:minutes*(rate(recent)-rate(prior))};
}
export function scalarPayout(points,{floor,cap,step,exponent}){
  const y=Math.min(cap,Math.max(floor,step*Math.floor(points/step)));
  return Math.floor(10000*(y/cap)**exponent+1e-9)/10000;
}
export function value(g,k) {
  if(k==='dd'||k==='td')return Number(['pts','reb','ast','stl','blk'].filter(s=>g[s]>=10).length>=(k==='dd'?2:3));
  return k==='pr'?g.pts+g.reb:k==='pa'?g.pts+g.ast:k==='ra'?g.reb+g.ast:
    k==='pra'?g.pts+g.reb+g.ast:k==='stocks'?g.stl+g.blk:g[k];
}
function random(seed) {
  let x=2166136261;
  for (const c of String(seed)) x=Math.imul(x^c.charCodeAt(0),16777619);
  return () => {x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
}
export function simulate(log, asOf, minutes, seed, n=4000) {
  const games=log.filter(g=>Date.parse(g.availableAt)<Date.parse(asOf)&&g.min>0&&stats.every(k=>Number.isInteger(g[k])&&g[k]>=0))
    .sort((a,b)=>Date.parse(b.availableAt)-Date.parse(a.availableAt)).slice(0,24);
  if(games.length<6) return null;
  const weights=games.map((_,i)=>.95**i), sum=weights.reduce((a,b)=>a+b);
  const base=games.reduce((a,g,i)=>a+g.min*weights[i],0)/sum;
  const target=minutes??base, rng=random(seed), samples=[];
  for(let j=0;j<n;j++){
    let w=rng()*sum,i=0;
    while(i<weights.length-1&&(w-=weights[i])>0)i++;
    const g=games[i], row={}, scale=Math.max(1,Math.min(55,g.min+target-base))/g.min;
    for(const k of stats){const v=g[k]*scale;row[k]=Math.floor(v)+(rng()<v%1?1:0);}
    // Keep points consistent with made threes after rounding a minutes scenario.
    row.pts=Math.max(row.pts,row.threes*3);
    samples.push(row);
  }
  return {samples,n:games.length,minutes:target};
}
export function distribution(sim,k,line,payout){
  if(!sim||k==='leader')return null;
  if(k==='escalator'){
    if(!payout)return null;
    const values=sim.samples.map(g=>scalarPayout(g.pts,payout)).sort((a,b)=>a-b);
    return {expectedPayout:values.reduce((s,p)=>s+p,0)/values.length,low:values[Math.floor(.1*(values.length-1))],high:values[Math.floor(.9*(values.length-1))],
      mean:sim.samples.reduce((s,g)=>s+g.pts,0)/sim.samples.length};
  }
  const x=sim.samples.map(g=>value(g,k)).sort((a,b)=>a-b);
  const p=q=>x[Math.floor(q*(x.length-1))];
  return {mean:x.reduce((a,b)=>a+b,0)/x.length,low:p(.1),high:p(.9),yes:x.filter(v=>v>=line).length/x.length};
}
export const usable=q=>q&&Number.isFinite(q.bid)&&Number.isFinite(q.ask)&&q.bid>0&&q.ask<1&&q.bid<q.ask;
export const mid=q=>usable(q)?(q.bid+q.ask)/2:null;
export function movement(points){
  const sorted=[...points].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const last=sorted.at(-1);
  if(!usable(last))return {label:'No two-sided quote'};
  const first=sorted.find(q=>usable(q)&&Date.parse(last.at)-Date.parse(q.at)>=10*60000&&Date.parse(last.at)-Date.parse(q.at)<=24*3600000);
  if(!first)return {label:'Building history'};
  const delta=mid(last)-mid(first), flow=Number.isFinite(first.volume)&&Number.isFinite(last.volume)?last.volume-first.volume:null;
  const tight=last.ask-last.bid<=.100001&&first.ask-first.bid<=.100001;
  const confirmed=tight&&flow>=50&&Math.abs(delta)>=.039999;
  return {delta,flow,first,last,confirmed,label:confirmed?(delta>0?'YES strengthened':'NO strengthened'):!tight?'Wide spread':'Unconfirmed move'};
}
export function compare(prob,q,fee=.02){
  if(!Number.isFinite(prob)||!usable(q))return null;
  const yes=prob-q.ask-fee, no=(1-prob)-(1-q.bid)-fee;
  return yes>=no?{side:'YES',gap:yes,cost:q.ask}:{side:'NO',gap:no,cost:1-q.bid};
}
// Under normal binary settlement, YES lower + NO higher pays at least $1.
export function ladderChecks(rows, costAllowance=.06){
  const groups=new Map(), findings=[];
  for(const r of rows){
    if(!['pts','reb','ast','threes','stl','blk','pra'].includes(r.stat)||!usable(r.quote)||r.quote.ask-r.quote.bid>.100001)continue;
    const k=JSON.stringify([r.series,r.player,r.game,r.start,r.stat,r.quote.at]);
    const g=groups.get(k)??[];g.push(r);groups.set(k,g);
  }
  for(const g of groups.values()){
    let best=null;
    for(const low of g)for(const high of g){
      if(low.threshold>=high.threshold||!(low.quote.depth>=1)||!(high.quote.bidDepth>=1))continue;
      const cost=low.quote.ask+(1-high.quote.bid)+costAllowance;
      if(cost<1&&(!best||cost<best.cost))best={low,high,cost,margin:1-cost};
    }
    if(best)findings.push(best);
  }
  return findings.sort((a,b)=>b.margin-a.margin);
}
export function replay(log,market){
  const rows=[...log].sort((a,b)=>Date.parse(a.availableAt)-Date.parse(b.availableAt));
  let n=0,error=0,brier=0,base=0;
  for(const game of rows){
    if(!game.start)continue;
    const sim=simulate(rows,game.start,null,game.start,800);
    if(!sim)continue;
    const estimate=distribution(sim,market,0), threshold=Math.max(1,Math.ceil(estimate.mean));
    const forecast=distribution(sim,market,threshold), actual=value(game,market);
    error+=Math.abs(forecast.mean-actual);brier+=(forecast.yes-Number(actual>=threshold))**2;base+=.25;n++;
  }
  return {n,mae:n?error/n:null,brier:n?brier/n:null,baseline:n?base/n:null};
}
