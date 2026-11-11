const bounded=p=>Math.max(.015,Math.min(.985,p));
const logit=p=>Math.log(bounded(p)/(1-bounded(p)));
const sigmoid=x=>1/(1+Math.exp(-x));
const features=(r,n)=>{
  const x=[1,logit(r.p1)];
  if(n>=3)x.push(logit(r.model)-logit(r.p1));
  if(n>=4)x.push(Math.max(-1.5,Math.min(1.5,r.role/8)));
  if(n===5)x.push(Math.max(-1.5,Math.min(1.5,r.usage/4)));
  return x;
};

// Fit a small correction to the market log-odds, shrinking coefficients toward no correction.
export function fit(rows,includeModel=false,includeRole=false,includeUsage=false) {
  const b=Array(includeUsage?5:includeRole?4:includeModel?3:2).fill(0);
  if(!rows.length)return b;
  const reg=[30,60,100,75,75], rate=.1;
  const xs=rows.map(r=>features(r,b.length));
  for(let step=0;step<450;step++){
    const g=b.map((v,i)=>v*reg[i]);
    for(let j=0;j<rows.length;j++){
      const x=xs[j], error=sigmoid(logit(rows[j].p1)+x.reduce((s,v,i)=>s+v*b[i],0))-rows[j].y;
      for(let i=0;i<b.length;i++)g[i]+=error*x[i];
    }
    for(let i=0;i<b.length;i++)b[i]-=rate*g[i]/rows.length;
  }
  return b;
}
export function predict(r,b){
  return sigmoid(logit(r.p1)+features(r,b.length).reduce((s,x,i)=>s+x*b[i],0));
}
export function evaluateRole(rows,split,usage=false){
  const eligible=rows.filter(r=>Number.isFinite(r.role)&&Number.isFinite(r.model)&&(!usage||Number.isFinite(r.usage)));
  const train=eligible.filter(r=>r.day<split),test=eligible.filter(r=>r.day>=split);
  if(test.length<50)return {status:'insufficient',train:train.length,test:test.length};
  // Early-season fit is often impossible after requiring eleven played games.
  // Fall back to a fixed small adjustment; do not estimate it on the test outcomes.
  const fixed=train.length<50;
  const a=fixed?(usage?[0,0,0,.08]:[0,0,0]):fit(train,true,usage);
  const b=fixed?(usage?[0,0,0,.08,.10]:[0,0,0,.08]):fit(train,true,true,usage);
  const scored=test.map(r=>({...r,market:(r.p1-r.y)**2,plain:(predict(r,a)-r.y)**2,roleLoss:(predict(r,b)-r.y)**2}));
  const mean=(rs,k)=>rs.reduce((s,r)=>s+r[k],0)/rs.length;
  const gain=rs=>mean(rs,'plain')-mean(rs,'roleLoss');
  const vsMarket=rs=>mean(rs,'market')-mean(rs,'roleLoss');
  return {status:'ok',fixed,split,train:train.length,test:test.length,market:mean(scored,'market'),plain:mean(scored,'plain'),withRole:mean(scored,'roleLoss'),
    incrementalGain:gain(scored),ci:dayInterval(scored,gain),marketGain:vsMarket(scored),marketCI:dayInterval(scored,vsMarket),coefficient:b[usage?4:3]};
}
export function dayInterval(rows, metric) {
  const groups=new Map();
  for(const r of rows){const group=groups.get(r.day)??[];group.push(r);groups.set(r.day,group);}
  if(groups.size<5)return null;
  const blocks=[...groups.values()];
  let seed=87631;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const boot=Array.from({length:1200},()=>metric(blocks.flatMap(()=>blocks[Math.floor(random()*blocks.length)]))).filter(Number.isFinite).sort((a,b)=>a-b);
  return boot.length>=1000?[boot[Math.floor(boot.length*.025)],boot[Math.floor(boot.length*.975)]]:null;
}
export function evaluateCalibration(rows) {
  const days=[...new Set(rows.map(r=>r.day))].sort(), split=days[Math.floor(days.length*.6)];
  const train=rows.filter(r=>r.day<split&&r.model!==null), test=rows.filter(r=>r.day>=split&&r.model!==null);
  if(train.length<50||test.length<50)return {train:train.length,test:test.length,split,status:'insufficient'};
  const b=fit(train), m=fit(train,true), loss=(p,y)=>(p-y)**2;
  const evalRows=test.map(r=>{
    const calibrated=predict(r,b), augmented=predict(r,m);
    // Predetermine a conservative cost and minimum gap; do not tune them on returns.
    const yesc=r.ask+.03,noc=1-r.bid+.03;
    const edgeYes=augmented-yesc,edgeNo=1-augmented-noc;
    const take=Math.max(edgeYes,edgeNo)>=.03;
    const yes=edgeYes>=edgeNo;
    const paid=take?(yes?yesc:noc):0;
    return {...r,calibrated,augmented,baseLoss:loss(r.p1,r.y),calLoss:loss(calibrated,r.y),augLoss:loss(augmented,r.y),take,paid,pnl:take?(yes?r.y:1-r.y)-paid:0};
  });
  const mean=(items,k)=>items.reduce((s,r)=>s+r[k],0)/items.length;
  const gain=items=>mean(items,'baseLoss')-mean(items,'augLoss');
  const roi=items=>items.reduce((s,r)=>s+r.pnl,0)/items.reduce((s,r)=>s+r.paid,0);
  const bins=Array.from({length:5},(_,i)=>{
    const rs=evalRows.filter(r=>Math.min(4,Math.floor(r.p1*5))===i);
    return {band:[i*.2,(i+1)*.2],n:rs.length,market:rs.length?mean(rs,'p1'):null,actual:rs.length?mean(rs,'y'):null,adjusted:rs.length?mean(rs,'augmented'):null};
  });
  return {status:'ok',train:train.length,test:test.length,split,testDays:new Set(test.map(r=>r.day)).size,coefficients:{market:b,augmented:m},
    market:mean(evalRows,'baseLoss'),calibrated:mean(evalRows,'calLoss'),augmented:mean(evalRows,'augLoss'),gain:gain(evalRows),ci:dayInterval(evalRows,gain),
    trades:evalRows.filter(r=>r.take).length,pnl:evalRows.reduce((s,r)=>s+r.pnl,0),roi:Number.isFinite(roi(evalRows))?roi(evalRows):null,roiCI:dayInterval(evalRows,roi),bins};
}
