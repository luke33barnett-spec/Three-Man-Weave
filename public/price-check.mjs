const standard = new Set(['pts','reb','ast','threes','stl','blk','pra']);
const priced = p => Number.isFinite(p)&&p>0&&p<1;
const round = p => Math.round(p*1e6)/1e6;
export function checkThresholds(rows,{requireSize=true,savingBuffer=.02,pairCosts=.06}={}){
  const groups=new Map(),dominated=[],pairs=[];
  let ladders=0;
  const quote=(r,side)=>{
    const q=r.quote;
    if(priced(q.bid)&&priced(q.ask)&&q.bid>q.ask)return null;
    const price=side==='YES'?q.ask:priced(q.bid)?1-q.bid:null;
    const size=side==='YES'?q.depth:q.bidDepth;
    return priced(price)&&(!requireSize||size>=1)?{row:r,side,price:round(price),size}:null;
  };
  for(const r of rows){
    if(!standard.has(r.stat)||!r.series||!r.player||!r.game||!r.start||!r.quote?.at||!Number.isInteger(r.threshold))continue;
    const k=JSON.stringify([r.series,r.player,r.game,r.start,r.stat,r.quote.at]);
    const g=groups.get(k)??[];g.push(r);groups.set(k,g);
  }
  for(const g of groups.values()){
    if(new Set(g.filter(r=>quote(r,'YES')||quote(r,'NO')).map(r=>r.threshold)).size<2)continue;
    ladders++;
    let bestPair;
    const better=new Map();
    const remember=(from,to)=>{
      if(!from||!to)return;
      const saving=round(from.price-to.price);
      if(saving<=savingBuffer)return;
      const k=from.row.ticker+'|'+from.side;
      if(!better.has(k)||better.get(k).saving<saving)better.set(k,{from,to,saving});
    };
    for(const low of g)for(const high of g){
      if(low.threshold>=high.threshold)continue;
      const ly=quote(low,'YES'),hy=quote(high,'YES'),ln=quote(low,'NO'),hn=quote(high,'NO');
      remember(hy,ly);
      remember(ln,hn);
      if(ly&&hn){
        const cost=round(ly.price+hn.price+pairCosts);
        if(cost<1&&(!bestPair||cost<bestPair.cost))bestPair={yes:ly,no:hn,cost,margin:round(1-cost)};
      }
    }
    dominated.push(...better.values());
    if(bestPair)pairs.push(bestPair);
  }
  return {ladders,dominated:dominated.sort((a,b)=>b.saving-a.saving),pairs:pairs.sort((a,b)=>b.margin-a.margin)};
}
