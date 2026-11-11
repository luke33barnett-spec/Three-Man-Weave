// Independent points challenger. Only completed player games feed these features.
const mean=(xs,f)=>xs.reduce((a,x)=>a+f(x),0)/xs.length;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const attempts=r=>r.fga+.44*r.fta;
const eligible=r=>r.min>0&&Number.isFinite(r.pts)&&Number.isFinite(r.fga)&&Number.isFinite(r.fta);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export function scoringInputs(history,asOf){
  const cutoff=Date.parse(asOf);
  const g=history.filter(r=>eligible(r)&&Date.parse(r.availableAt)<cutoff)
    .sort((a,b)=>Date.parse(b.availableAt)-Date.parse(a.availableAt)).slice(0,24);
  if(g.length<6)return null;
  const recent=g.slice(0,3), earlier=g.slice(3);
  const minRecent=mean(recent,r=>r.min), minPrior=mean(earlier,r=>r.min);
  const mins=.45*minRecent+.55*minPrior;
  const rate=xs=>xs.reduce((s,r)=>s+attempts(r),0)/xs.reduce((s,r)=>s+r.min,0);
  const recentRate=rate(recent), priorRate=rate(earlier);
  const shots=mins*(.35*recentRate+.65*priorRate);
  // A weak prior prevents hot shooting from taking over short samples.
  const efficiency=(g.reduce((s,r)=>s+r.pts,0)+35*1.15)/(g.reduce((s,r)=>s+attempts(r),0)+35);
  const mu=shots*efficiency, avg=mean(g,r=>r.pts), sd=Math.sqrt(mean(g,r=>(r.pts-avg)**2));
  return {mu,n:g.length,scale:Math.sqrt(.6*sd**2+.4*(2.5+1.25*Math.sqrt(mu))**2),
    x:[1,clamp(mu/20-1,-1,2),clamp((minRecent-minPrior)/8,-2,2),clamp((recentRate-priorRate)*mins/4,-2,2)]};
}
export function fitPoints(examples){
  if(examples.length<60)return null;
  const b=[0,0,0,0],reg=[40,110,140,140];
  for(let step=0;step<300;step++){
    const grad=b.map((v,i)=>v*reg[i]);
    for(const {f,points} of examples){
      const e=f.mu+dot(b,f.x)-points;
      for(let i=0;i<b.length;i++)grad[i]+=e*f.x[i];
    }
    for(let i=0;i<b.length;i++)b[i]-=.12*grad[i]/examples.length;
  }
  const residuals=examples.map(({f,points})=>(points-f.mu-dot(b,f.x))/f.scale).sort((a,b)=>a-b);
  return {b,residuals};
}
export function pointsForecast(model,f,line){
  if(!model||!f)return null;
  const mean=Math.max(0,f.mu+dot(model.b,f.x));
  const z=(line-.5-mean)/f.scale;
  let l=0,h=model.residuals.length;
  while(l<h){const m=(l+h)>>1;if(model.residuals[m]<z)l=m+1;else h=m;}
  return {mean,yes:(model.residuals.length-l+1)/(model.residuals.length+2)};
}
