import {comboMinimum} from './payout.mjs';
const supported=new Set(['pts','reb','ast','threes','stl','blk','pra','dd','td']);
const chicago=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
export const slateDate=iso=>chicago.format(new Date(iso));
export function parlayIdeas(rows,limit=6){
  const unique=new Map();
  for(const r of rows){
    const q=r.quote,p=r.projection?.yes;
    if(!supported.has(r.stat)||!Number.isFinite(p)||r.sample<12||!q||
      !(q.bid>0&&q.bid<q.ask&&q.ask<1&&q.ask-q.bid<=.080001))continue;
    const gameId=r.gameId??r.game+'|'+r.start;
    const blend=.75*(q.bid+q.ask)/2+.25*p;
    for(const [side,prob,price,size] of [['YES',blend,q.ask,q.depth],['NO',1-blend,1-q.bid,q.bidDepth]]){
      if(prob<.62||prob>.90||size<1||!Number.isFinite(size))continue;
      const leg={ticker:r.ticker,gameId,game:r.game,start:r.start,stat:r.stat,player:r.player,threshold:r.threshold,side,prob,price,score:prob-price};
      const k=JSON.stringify([gameId,r.player,r.stat]);
      if(!unique.has(k)||unique.get(k).score<leg.score)unique.set(k,leg);
    }
  }
  const counts=new Map();
  const legs=[...unique.values()].sort((a,b)=>b.score-a.score||a.ticker.localeCompare(b.ticker)).filter(l=>{
    const n=counts.get(l.stat)??0;
    if(n>=14)return false;
    counts.set(l.stat,n+1);return true;
  }), pairs=[];
  for(let i=0;i<legs.length;i++)for(let j=i+1;j<legs.length;j++){
    const a=legs[i],b=legs[j];
    if(a.gameId===b.gameId)continue;
    const chance=a.prob*b.prob, minimum=comboMinimum(Math.floor(Math.max(0,chance-.05)*100)/100);
    if(minimum===null)continue;
    pairs.push({legs:[a,b],chance,minimum,score:chance-a.price*b.price,
      id:[a,b].map(l=>l.ticker+'-'+l.side).sort().join('|'),firstTip:Date.parse(a.start)<Date.parse(b.start)?a.start:b.start});
  }
  pairs.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const chosen=[], used=new Map(), stats=new Set();
  while(chosen.length<limit){
    const eligible=pairs.filter(p=>p.legs.every(l=>(used.get(l.player)??0)<2));
    const top=eligible.reduce((best,p)=>{
      const priority=q=>q.score+.008*new Set(q.legs.filter(l=>!stats.has(l.stat)).map(l=>l.stat)).size;
      return !best||priority(p)>priority(best)?p:best;
    },null);
    if(!top)break;
    pairs.splice(pairs.indexOf(top),1);chosen.push(top);
    for(const l of top.legs){used.set(l.player,(used.get(l.player)??0)+1);stats.add(l.stat);}
  }
  return chosen;
}
export function lockParlays(rows,nights,at){
  const now=Date.parse(at), day=slateDate(at);
  if(nights.some(n=>n.day===day))return nights;
  const slate=rows.filter(r=>slateDate(r.start)===day&&Date.parse(r.start)>now+15*60000&&r.quote?.at===at);
  if(!slate.length||Math.min(...slate.map(r=>Date.parse(r.start)))>now+120*60000)return nights;
  const ideas=parlayIdeas(slate);
  if(!ideas.length)return nights;
  return [...nights,{day,at,rule:'two-leg-board-v1',ideas:ideas.map(p=>({...p,status:'pending'}))}];
}
function settle(leg,m){
  if(!m||!['finalized','settled'].includes(m.status))return null;
  const v=m.settlement_value_dollars, y=v!=null&&v!==''?Number(v):m.result==='yes'?1:m.result==='no'?0:null;
  if(y===null||!Number.isFinite(y)||y<0||y>1)return null;
  return leg.side==='YES'?y:1-y;
}
export function gradeParlays(nights,markets){
  return nights.map(n=>({...n,ideas:n.ideas.map(p=>{
    if(p.status!=='pending')return p;
    const legs=p.legs.map(l=>({...l,payout:l.payout??settle(l,markets.get(l.ticker))}));
    if(legs.some(l=>l.payout===0))return {...p,legs,payout:0,status:'loss'};
    if(legs.some(l=>l.payout===null))return {...p,legs};
    const payout=legs.reduce((a,l)=>a*l.payout,1);
    return {...p,legs,payout,status:payout===1?'win':'fractional'};
  })}));
}
