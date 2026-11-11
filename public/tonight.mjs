import {candidate,suggestCombo} from './picks.mjs';
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
const cents=x=>(100*x).toFixed(1).replace(/\.0$/,'')+'¢';
const percent=x=>(100*x).toFixed(0)+'%';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function tonightView(el,board,log,overlay=null){
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
  el.innerHTML='<div class="tonight-status"><span>'+esc(day)+' · Central Time</span><span>'+(!fresh?'Quotes too old for new ideas':demo?'Sample data':overlay?'Rechecked '+Object.keys(overlay.quotes).length+' quotes':'Fresh Kalshi snapshot')+'</span>'+(!demo?'<button id="refresh-quotes" type="button">Refresh prices</button>':'')+'</div><p id="price-status" class="small" aria-live="polite"></p>'+
    '<div class="tools"><div><h2>Top singles</h2><p>Points only · Ranked by estimated return per dollar</p></div><span class="feed">EXPERIMENTAL</span></div>'+
    (best.length?'<div class="pick-grid">'+best.map((p,i)=>'<article class="research-card pick-card"><div class="kicker">'+(demo?'SAMPLE PICK':overlay?'WATCHLIST · RECHECKED ASK':'WATCHLIST · SNAPSHOT ASK')+' · '+(i+1)+'</div><h3>'+esc(p.player)+'</h3><p>'+esc(p.game)+' · '+(p.side==='YES'?p.threshold+'+':p.threshold-1+' or fewer')+' points</p><div class="pick-price"><span>Ask when checked <b>'+cents(p.price)+'</b></span><span>Estimated chance <b>'+percent(p.prob)+'</b></span><span>Estimated return <b class="up">+'+percent(p.returnRate)+'</b></span></div></article>').join('')+'</div>':
      '<div class="research-card"><p>'+(!fresh?'Run a refresh to see current candidates.':demo?'Demo mode: the combo examples below use fictional quotes.':'Nothing clears the singles screen on this snapshot.')+'</p></div>')+
    '<div class="tools combo-title"><div><h2>Suggested parlays</h2><p>Lower points lines from different games</p></div></div>'+
    '<div class="research-card combo-suggestion"><div class="pills"><button data-combo="2" aria-pressed="true">2 legs</button><button data-combo="3" aria-pressed="false">3 legs</button></div><div id="suggestion"></div></div>'+
    '<details class="research-card"><summary>Paper results · '+graded.length+' settled</summary><p>'+wins+' wins · '+losses+' losses · '+(graded.length-wins-losses)+' fractional · '+archived.filter(p=>p.status==='pass').length+' passes. '+(graded.length?'Simulated P&amp;L after costs: $'+pnl.toFixed(2)+'.':'No settled paper entries yet.')+'</p><p>We lock at most one points single per game on the first eligible refresh 10–50 minutes before tipoff. Prices are observed asks; fills are hypothetical. This does not track combos.</p>'+
    (archived.length?'<ul>'+[...archived].reverse().slice(0,10).map(p=>'<li>'+esc(p.game)+' · '+(p.status==='pass'?'Pass':esc(p.player)+' · '+esc(p.side)+' '+p.threshold+'+ at '+cents(p.price)+' · '+esc(p.status))+'</li>').join('')+'</ul>':'')+'</details>';
  const show=n=>{
    for(const b of el.querySelectorAll('[data-combo]'))b.setAttribute('aria-pressed',String(Number(b.dataset.combo)===n));
    const s=fresh?suggestCombo(slate,n):null, target=el.querySelector('#suggestion');
    if(!s){target.innerHTML='<p>'+(!fresh?'Refresh the board to build a combo from current prices.':'Not enough qualifying lower lines from '+n+' different games.')+'</p>';return;}
    target.innerHTML='<ol class="combo-legs">'+s.legs.map(l=>'<li><div><strong>'+esc(l.player)+' '+l.threshold+'+ points</strong><small>'+esc(l.game)+'</small></div><span>'+percent(l.prob)+'</span></li>').join('')+'</ol>'+
      '<div class="pick-price"><span>Estimated hit chance <b>'+percent(s.chance)+'</b></span><span>Model price ceiling <b>'+cents(s.ceiling)+'</b></span></div>'+
      '<label class="actual-combo">Kalshi ask for this exact combo <input id="bundle-ask" type="number" min="1" max="99" step=".1" placeholder="Price in cents"></label><p id="bundle-status" aria-live="polite"></p>'+
      '<p class="small">The estimate assumes independent legs. The ceiling leaves 5¢ for costs and uncertainty. The app does not fetch a bundle quote or verify availability; the model has no validated betting edge.</p>';
    target.querySelector('#bundle-ask').oninput=e=>{
      const value=Number(e.target.value),status=target.querySelector('#bundle-status');
      status.textContent=value>0&&value<100?(value<=100*s.ceiling?'Within the model ceiling; still an experimental estimate.':'Above the model ceiling — pass.'):'';
    };
  };
  el.querySelectorAll('[data-combo]').forEach(b=>b.onclick=()=>show(Number(b.dataset.combo)));
  show(2);
  const button=el.querySelector('#refresh-quotes');
  if(button)button.onclick=async()=>{
    const status=el.querySelector('#price-status');
    const points=fullSlate.filter(r=>r.stat==='pts'&&r.series==='KXNBAPTS');
    const ranked=points.flatMap(r=>{const p=candidate(r);return p?[{r,p}]:[];})
      .sort((a,b)=>b.p.returnRate-a.p.returnRate).slice(0,10).map(x=>x.r);
    const comboLegs=suggestCombo(points,3)?.legs??suggestCombo(points,2)?.legs??[];
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
      tonightView(el,board,log,data);
      el.querySelector('#price-status').textContent='Rechecked only selected points contracts. Model and paper results still come from the last scheduled update.';
    }catch(e){status.textContent=e.message||'Could not refresh prices.';button.disabled=false;}
  };
}
