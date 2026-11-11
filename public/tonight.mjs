import {candidate,PICK_COST,MIN_GAP} from './picks.mjs';
import {payoutMultiple,minimumMultiple,formatMultiple} from './payout.mjs';
import {parlayIdeas} from './parlays.mjs';
import {parlayView} from './parlay-view.mjs';
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
const percent=x=>(100*x).toFixed(0)+'%';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function tonightView(el,board,log,overlay=null,comboLog=null){
  const demo=board.mode==='demo', now=demo?Date.parse(board.at):Date.now();
  const fresh=demo||now-Date.parse(overlay?.at??board.at)<=6*60000;
  el.dataset.quoteAt=overlay?.at??board.at;
  el.dataset.fresh=String(fresh);
  const upcoming=board.rows.filter(r=>Date.parse(r.start)>now).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  const day=upcoming.length?date.format(new Date(upcoming[0].start)):date.format(new Date(now));
  const fullSlate=upcoming.filter(r=>date.format(new Date(r.start))===day);
  const slate=overlay?fullSlate.filter(r=>Object.hasOwn(overlay.quotes,r.ticker)).map(r=>({...r,quote:overlay.quotes[r.ticker]})):fullSlate;
  const archived=log?.decisions??[];
  const bestByGame=new Map();
  if(fresh)for(const r of slate){
    const p=candidate(r);
    if(p&&(!bestByGame.has(r.gameId)||bestByGame.get(r.gameId).returnRate<p.returnRate))bestByGame.set(r.gameId,{...r,...p,status:'watch'});
  }
  const best=[...bestByGame.values()].sort((a,b)=>b.returnRate-a.returnRate).slice(0,5);
  const graded=archived.filter(p=>['win','loss','fractional'].includes(p.status));
  const pnl=graded.reduce((s,p)=>s+p.net,0);
  const wins=graded.filter(p=>p.status==='win').length, losses=graded.filter(p=>p.status==='loss').length;
  el.innerHTML='<div class="tonight-status"><span>'+esc(day)+' · Central Time</span><span>'+(!fresh?'Prices need a refresh':demo?'Sample data':overlay?'Prices rechecked':'Recent Kalshi prices')+'</span>'+(!demo?'<button id="refresh-quotes" type="button">Refresh prices</button>':'')+'</div><p id="price-status" class="small" aria-live="polite"></p>'+
    '<div class="tools"><div><h2>Top singles</h2><p>Our highest-ranked points ideas at the prices we checked.</p></div><span class="feed">IN TESTING</span></div>'+
    (best.length?'<div class="pick-grid">'+best.map((p,i)=>'<article class="research-card pick-card"><div class="kicker">'+(demo?'SAMPLE PICK':'PICK TO WATCH')+' · '+(i+1)+'</div><h3>'+esc(p.player)+'</h3><p>'+esc(p.game)+' · '+(p.side==='YES'?p.threshold+'+':p.threshold-1+' or fewer')+' points</p><div class="pick-price"><span>Payout when checked <b>'+formatMultiple(payoutMultiple(p.price))+'</b></span><span>Look for at least <b class="up">'+formatMultiple(minimumMultiple(p.prob-PICK_COST-MIN_GAP))+'</b></span><span>Model hit chance <b>'+percent(p.prob)+'</b></span></div></article>').join('')+'</div>':
      '<div class="research-card"><p>'+(!fresh?'Run a refresh to see current candidates.':demo?'Demo mode: the combo examples below use fictional quotes.':'Nothing clears the singles screen on this snapshot.')+'</p></div>')+
    '<div class="tools combo-title"><div><h2>Two-leg parlays</h2><p>Different games · 2.00× minimum</p></div></div><div id="suggestion"></div>'+
    '<details class="research-card"><summary>Paper results · '+graded.length+' settled</summary><p>'+wins+' wins · '+losses+' losses · '+(graded.length-wins-losses)+' fractional · '+archived.filter(p=>p.status==='pass').length+' passes. '+(graded.length?'Simulated P&amp;L after costs: $'+pnl.toFixed(2)+'.':'No settled paper entries yet.')+'</p><p>We lock at most one points single per game on the first eligible refresh 10–50 minutes before tipoff. Prices are observed asks; fills are hypothetical. This does not track combos.</p>'+
    (archived.length?'<ul>'+[...archived].reverse().slice(0,10).map(p=>'<li>'+esc(p.game)+' · '+(p.status==='pass'?'Pass':esc(p.player)+' · '+esc(p.side)+' '+p.threshold+'+ at '+formatMultiple(payoutMultiple(p.price))+' · '+esc(p.status))+'</li>').join('')+'</ul>':'')+'</details>';
  const nights=comboLog?.nights??[];
  parlayView(el.querySelector('#suggestion'),slate,day,now,fresh,demo,nights);
  const button=el.querySelector('#refresh-quotes');
  if(button)button.onclick=async()=>{
    const status=el.querySelector('#price-status');
    const points=fullSlate.filter(r=>r.stat==='pts'&&r.series==='KXNBAPTS');
    const ranked=points.flatMap(r=>{const p=candidate(r);return p?[{r,p}]:[];})
      .sort((a,b)=>b.p.returnRate-a.p.returnRate).slice(0,10).map(x=>x.r);
    const comboLegs=(nights.find(n=>n.day===day)?.ideas??parlayIdeas(fullSlate)).flatMap(p=>p.legs)
      .map(l=>fullSlate.find(r=>r.ticker===l.ticker)).filter(Boolean);
    const priority=[...comboLegs,...ranked];
    const references=points.filter(r=>priority.some(p=>p.gameId===r.gameId&&p.player===r.player));
    const backup=points.filter(r=>r.sample>=12&&r.quote?.depth>=1);
    const tickers=[...new Set([...priority,...references,...backup].map(r=>r.ticker))].slice(0,48);
    if(!tickers.length){status.textContent='No upcoming points contracts in the published slate.';return;}
    button.disabled=true;status.textContent='Checking current Kalshi asks…';
    try{
      const r=await fetch('/api/quotes?'+new URLSearchParams({tickers:tickers.join(',')}),{cache:'no-store',signal:AbortSignal.timeout(10000)});
      const data=await r.json();
      if(!r.ok||!data.quotes||!Object.keys(data.quotes).length)throw Error(data.error??'None of those contracts returned an open quote.');
      tonightView(el,board,log,data,comboLog);
      el.querySelector('#price-status').textContent='Rechecked selected individual props. The nightly card and paper results come from scheduled updates.';
    }catch(e){status.textContent=e.message||'Could not refresh prices.';button.disabled=false;}
  };
}
