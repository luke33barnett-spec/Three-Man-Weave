export const PICK_RULE='points-v1';
export const PICK_COST=.02;
export const MIN_GAP=.015;
export function candidate(row){
  const q=row.quote, raw=row.projection?.yes;
  if(row.stat!=='pts'||row.series!=='KXNBAPTS'||row.sample<12||!q||!Number.isFinite(raw)||!(raw>=0&&raw<=1)||
    !(q.bid>0&&q.ask<1&&q.bid<q.ask&&q.ask-q.bid<=.080001))return null;
  const market=(q.bid+q.ask)/2;
  const fair=.75*market+.25*raw;
  const sides=[['YES',fair,q.ask,q.depth],['NO',1-fair,1-q.bid,q.bidDepth]];
  return sides.map(([side,prob,price,size])=>({side,prob,price,size,market:side==='YES'?market:1-market,gap:prob-price-PICK_COST,
    returnRate:(prob-price-PICK_COST)/(price+PICK_COST)}))
    .filter(x=>x.size>=1&&x.price>=.15&&x.price<=.85&&x.gap>=MIN_GAP).sort((a,b)=>b.returnRate-a.returnRate)[0]??null;
}
export function lockSlate(rows,decisions,at){
  const ts=Date.parse(at),seen=new Set(decisions.map(d=>d.gameId));
  const groups=new Map();
  for(const r of rows){
    const toTip=(Date.parse(r.start)-ts)/60000;
    if(r.stat!=='pts'||!r.gameId||seen.has(r.gameId)||!(toTip>=10&&toTip<=50)||r.quote?.at!==at)continue;
    const g=groups.get(r.gameId)??[];g.push(r);groups.set(r.gameId,g);
  }
  const next=[];
  for(const [gameId,items] of groups){
    const ranked=items.flatMap(r=>{const p=candidate(r);return p?[{r,p}]:[];})
      .sort((a,b)=>b.p.returnRate-a.p.returnRate||a.r.ticker.localeCompare(b.r.ticker));
    const best=ranked[0], {game,start}=items[0];
    const base={rule:PICK_RULE,gameId,game,start,at,screened:items.length};
    next.push(best?{...base,ticker:best.r.ticker,player:best.r.player,threshold:best.r.threshold,
      ...best.p,cost:PICK_COST,status:'pending'}:{...base,status:'pass'});
  }
  return [...decisions,...next];
}
export function gradeDecision(p,m){
  if(p.status!=='pending'||p.ticker!==m?.ticker||!['finalized','settled'].includes(m.status))return p;
  const v=m.settlement_value_dollars;
  const y=v!=null&&v!==''?Number(v):m.result==='yes'?1:m.result==='no'?0:null;
  if(y===null||!Number.isFinite(y)||y<0||y>1)return p;
  const payout=p.side==='YES'?y:1-y;
  return {...p,payout,status:y===0||y===1?(payout===1?'win':'loss'):'fractional',net:payout-p.price-p.cost};
}
export function suggestCombo(rows,length=2,{minSample=12}={}){
  if(![2,3].includes(length))return null;
  const byPlayer=new Map(),byGame=new Map();
  for(const r of rows){
    const q=r.quote,raw=r.projection?.yes;
    if(r.stat!=='pts'||r.sample<minSample||!Number.isFinite(raw)||!q||!(q.bid>0&&q.ask<1&&q.bid<q.ask&&q.ask-q.bid<=.080001&&q.depth>=1))continue;
    const gameId=r.gameId??r.game+'|'+r.start;
    const key=JSON.stringify([gameId,r.player]);
    const set=byPlayer.get(key)??[];
    const market=(q.bid+q.ask)/2;
    set.push({...r,gameId,market,prob:.75*market+.25*raw});
    byPlayer.set(key,set);
  }
  for(const props of byPlayer.values()){
    const central=[...props].sort((a,b)=>Math.abs(a.market-.5)-Math.abs(b.market-.5)||b.threshold-a.threshold)[0];
    for(const r of props){
      if(r.threshold>=central.threshold||r.prob<.62||r.prob>.88)continue;
      const score=r.prob-r.quote.ask;
      if(!byGame.has(r.gameId)||byGame.get(r.gameId).score<score)byGame.set(r.gameId,{...r,score});
    }
  }
  const legs=[...byGame.values()].sort((a,b)=>b.score-a.score||a.ticker.localeCompare(b.ticker)).slice(0,length);
  if(legs.length<length)return null;
  const chance=legs.reduce((p,l)=>p*l.prob,1);
  return {legs,chance,ceiling:Math.floor(Math.max(0,chance-.05)*100)/100};
}
