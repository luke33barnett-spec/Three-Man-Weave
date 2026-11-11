import {MARKETS,mid,movement,compare,scalarPayout} from './model.mjs';
import {checkThresholds} from './price-check.mjs';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const number=(v,d=0)=>Number.isFinite(v)?v.toFixed(d):'—';
const pct=v=>Number.isFinite(v)?number(v*100,1)+'%':'—';
const cents=v=>Number.isFinite(v)?number(v*100,1)+'¢':'—';
const signed=v=>Number.isFinite(v)?(v>0?'+':'')+number(v*100,1)+'¢':'—';
const fmtDate=s=>new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const card=(title,value,note)=>'<div class="metric"><div class="kicker">'+esc(title)+'</div><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>';
let market='all', selected=null, board, research, priceAudit, live=false, stale=false,page=0;
const pageSize=35;
const legs=[];
const basic=['pts','reb','ast','threes','stl','blk','pra'];
const modelValue=r=>r.stat==='escalator'?r.projection?.expectedPayout:r.projection?.yes;
function combo(){
  const p=legs.reduce((v,r)=>v*r.projection.yes,1), ask=Number($('#combo-ask').value)/100;
  $('#legs').innerHTML=legs.length?'<ul>'+legs.map((r,i)=>'<li>'+esc(r.player)+' · '+esc(MARKETS[r.stat][1])+contractLine(r)+' · '+pct(r.projection.yes)+' <button data-remove="'+i+'">Remove</button></li>').join('')+'</ul>':'<p class="small">No legs selected. Open a contract for its lower thresholds.</p>';
  $('#combo-result').textContent=live&&(stale||legs.some(r=>Date.parse(r.start)<=Date.now()))?'A leg has started or the snapshot is stale. Clear expired legs and use a fresh quote.':legs.length<2?'Select two or three legs in separate games.':
    'Approximate joint probability: '+pct(p)+(ask>0&&ask<1?' · Gap after 3¢ assumed cost: '+signed(p-ask-.03):' · Enter the actual combo ask to compare.');
}
function plot(history){
  const rows=history.filter(q=>mid(q)!==null);
  if(rows.length<2)return '<p class="small">A second two-sided snapshot is needed for a chart.</p>';
  const values=rows.map(mid), times=rows.map(q=>Date.parse(q.at));
  const lo=Math.max(0,Math.min(...values)-.03), hi=Math.min(1,Math.max(...values)+.03);
  const coords=values.map((p,i)=>[8+(times[i]-times[0])/Math.max(1,times.at(-1)-times[0])*264,76-(p-lo)/(hi-lo)*65]);
  return '<svg viewBox="0 0 280 85" role="img" aria-label="YES midpoint from '+cents(values[0])+' to '+cents(values.at(-1))+'"><path d="M8 22H272 M8 49H272 M8 76H272" stroke="#35483e"/><polyline points="'+coords.map(x=>x.join(',')).join(' ')+'" fill="none" stroke="#c2fb81" stroke-width="2.5"/><circle cx="'+coords.at(-1)[0]+'" cy="'+coords.at(-1)[1]+'" r="3.5" fill="#c2fb81"/></svg><p class="small">'+esc(fmtDate(rows[0].at))+' → '+esc(fmtDate(rows.at(-1).at))+'</p>';
}
function detail(r){
  if(!r){$('#detail').innerHTML='<p>Select a player contract to inspect the evidence.</p>';return;}
  const p=r.projection,m=r.move,scalar=r.stat==='escalator';
  const special=['dd','td'].includes(r.stat);
  const lower=basic.includes(r.stat)?board.rows.filter(x=>x.ticker!==r.ticker&&x.stat===r.stat&&x.player===r.player&&x.game===r.game&&x.start===r.start&&x.threshold<r.threshold&&Number.isFinite(x.projection?.yes)).sort((a,b)=>b.threshold-a.threshold).slice(0,4):[];
  const options=basic.includes(r.stat)&&Number.isFinite(r.projection?.yes)&&!stale?
    '<div class="combo-actions"><div class="kicker">COMBO LEGS</div><button data-leg="'+esc(r.ticker)+'">Add '+r.threshold+'+ YES</button>'+lower.map(x=>'<button data-leg="'+esc(x.ticker)+'">'+x.threshold+'+ YES · '+pct(x.projection.yes)+'</button>').join('')+'<p class="small" id="leg-message"></p></div>':'';
  $('#detail').innerHTML='<div class="kicker">CONTRACT EVIDENCE</div><h3>'+esc(r.player)+'</h3><p>'+esc(MARKETS[r.stat][0])+contractLine(r)+' · '+esc(r.game)+'</p>'+
    (r.stat==='leader'?'<p class="notice">Quote only. A tie pays a fraction of $1; a single-player probability cannot price this contract.</p>':'<div class="stats">'+[[scalar?'Expected payout':special?'Simulated hit rate':'Projection',scalar?cents(p?.expectedPayout):special?pct(p?.yes):number(p?.mean,1)],[special?'Target':'Simulated 10–90%',scalar&&p?cents(p.low)+'–'+cents(p.high):special?(r.stat==='dd'?'10+ in 2 stats':'10+ in 3 stats'):p?p.low+'–'+p.high:'—'],['Box scores',r.sample||'—'],['Expected minutes',number(r.minutes,1)]].map(([k,v])=>'<div><span class="small">'+k+'</span><strong>'+v+'</strong></div>').join('')+'</div>')+
    (Number.isFinite(r.role)?'<p class="small">Rotation shift: <strong>'+esc((r.role>0?'+':'')+number(r.role,1))+' min</strong> · last 3 appearances vs. prior 8</p>':'')+
    (r.usage?'<p class="small">Shot opportunities: <strong>'+number(r.usage.expected,1)+'</strong> · '+(r.usage.shift>=0?'+':'')+number(r.usage.shift,1)+' vs. earlier rate at recent minutes</p>':'')+
    (scalar&&r.payout?'<p class="notice">Payout, not hit probability. Examples: '+[20,30,40].map(n=>n+' pts → '+cents(scalarPayout(n,r.payout))).join(' · ')+'. Estimate assumes the player appears; it is not a validated escalator price model.</p>':'')+
    '<div class="kicker">YES MIDPOINT</div>'+plot(r.history)+
    '<div class="stats">'+[['Price move',signed(m.delta)],['Volume change',Number.isFinite(m.flow)?number(m.flow)+' contracts':'—'],['Spread',mid(r.quote)===null?'—':cents(r.quote.ask-r.quote.bid)],['Total volume',number(r.quote.volume)]].map(([k,v])=>'<div><span class="small">'+k+'</span><strong>'+v+'</strong></div>').join('')+'</div>'+
    '<p class="small">'+esc(m.label)+'. '+(r.agree?'Move and model point in the same direction. ':'')+'Raw model gap uses the current ask and a 2¢ cost assumption. The simulation is uncalibrated; a positive gap is not a validated edge.</p>'+
    (live?'<p class="small" style="margin-top:10px">'+esc(r.ticker)+' · Tipoff '+esc(fmtDate(r.start))+'</p>':'')+options;
}
function render(){
  stale=live&&Date.now()-Date.parse(board.at)>45*60000;
  $('#feed').textContent=live?(stale?'STALE SNAPSHOT':'KALSHI SNAPSHOT'):'DEMO DATA';
  const rows=board.rows.filter(r=>MARKETS[r.stat]&&(!live||Date.parse(r.start)>Date.now())).map(r=>{
    const move=movement(r.history), edge=stale?null:compare(modelValue(r),r.quote);
    const agree=!stale&&move.confirmed&&edge?.gap>=.02&&edge.side===(move.delta>0?'YES':'NO');
    return {...r,move,edge,agree};
  });
  $('#metrics').innerHTML=[card('PREGAME CONTRACTS',rows.length,'Matched to the slate'),card('MODEL COVERAGE',rows.filter(r=>r.projection).length,'Six or more prior appearances'),card('CONFIRMED MOVES',stale?'—':rows.filter(r=>r.move.confirmed).length,'Tight spread + traded volume'),card('MOVE + MODEL',stale?'—':rows.filter(r=>r.agree).length,'At least 2¢ estimated gap')].join('');
  $('#notice').textContent=(live?(stale?'Snapshot older than 45 minutes; value signals paused. ':'Captured '+fmtDate(board.at)+'. '):'Fictional players and prices for the demo. Research uses separately collected historical data. ')+(board.warnings??[]).join(' · ');
  const priceStale=live&&Date.now()-Date.parse(board.at)>6*60000;
  const scan=checkThresholds(priceStale?[]:rows);
  const describe=x=>x.side+' '+x.row.threshold+'+ at '+cents(x.price);
  $('#ladder-count').textContent=priceStale?'· waiting for fresh quotes':'· '+scan.dominated.length+' dominated quotes';
  $('#ladder').innerHTML='<p>Find a cheaper contract that covers every scoring outcome of a more expensive one. This comparison uses available asks, not model predictions.</p>'+
    (scan.dominated.length?'<ul class="price-findings">'+scan.dominated.slice(0,8).map(({from,to,saving})=>'<li><strong>'+esc(from.row.player)+' · '+esc(MARKETS[from.row.stat][1])+'</strong> <span>'+describe(from)+' → '+describe(to)+'</span> <b class="up">'+cents(saving)+' cheaper</b> <small>'+number(to.size,1)+' displayed at the better ask</small></li>').join('')+'</ul>':'<p class="small">'+(priceStale?'Price Check requires a snapshot no older than six minutes. Run the local collector to refresh.':'No dominated quotes passed the screen across '+scan.ladders+' comparable ladders.')+'</p>')+
    (scan.pairs.length?'<p><strong>Two-leg price anomalies:</strong></p><ul>'+scan.pairs.slice(0,5).map(({yes,no,cost})=>'<li>'+esc(yes.row.player)+' · '+esc(MARKETS[yes.row.stat][1])+' · '+describe(yes)+' and '+describe(no)+' · '+cents(cost)+' total with allowance</li>').join('')+'</ul>':'<p class="small">No two-leg pairs flagged after a 6¢ total cost allowance.</p>')+
    '<p class="small">Flags require displayed size and a quoted saving over 2¢. Recheck the ask, fees and settlement rules. A cheaper contract can still lose; two-leg quotes do not guarantee both fills.</p>';
  $('#markets').innerHTML=[['all','ALL'],...Object.entries(MARKETS).map(([k,v])=>[k,v[1]])].map(([k,v])=>'<button type="button" aria-pressed="'+(market===k)+'" data-market="'+k+'">'+v+'</button>').join('');
  const query=$('#search').value.trim().toLowerCase(), filter=$('#filter').value;
  const found=rows.filter(r=>(market==='all'||r.stat===market)&&(!query||(r.player+' '+r.game).toLowerCase().includes(query))&&(filter==='all'||!stale&&(filter==='move'?r.move.confirmed:r.agree)))
    .sort((a,b)=>Number(b.agree)-Number(a.agree)||Number(!!b.move.confirmed)-Number(!!a.move.confirmed)||(b.edge?.gap??-9)-(a.edge?.gap??-9));
  const pages=Math.max(1,Math.ceil(found.length/pageSize));page=Math.min(page,pages-1);
  const shown=found.slice(page*pageSize,(page+1)*pageSize);
  if(!shown.some(r=>r.ticker===selected))selected=shown[0]?.ticker;
  $('#count').textContent=found.length+' shown · Select a player to inspect the quote history';
  $('#empty').hidden=!!found.length;
  $('#pagination').hidden=pages<2;$('#prev').disabled=page===0;$('#next').disabled=page>=pages-1;$('#page').textContent='Page '+(page+1)+' of '+pages;
  $('#rows').innerHTML=shown.map(r=>'<tr class="'+(r.ticker===selected?'selected':'')+'"><td><button data-ticker="'+esc(r.ticker)+'" aria-pressed="'+(r.ticker===selected)+'">'+esc(r.player)+'</button><span class="small">'+esc(MARKETS[r.stat][1])+contractLine(r)+' · '+esc(r.game)+'</span></td><td>'+(r.stat==='escalator'?cents(modelValue(r))+' payout':pct(modelValue(r)))+'</td><td>'+cents(r.quote.bid)+' / '+cents(r.quote.ask)+'</td><td class="'+(r.move.confirmed?(r.move.delta>0?'up':'down'):'')+'">'+signed(r.move.delta)+'<span class="small">'+esc(r.move.label)+'</span></td><td class="'+(r.edge?.gap>0?'up':'')+'">'+(r.edge?signed(r.edge.gap)+' '+r.edge.side:'—')+'</td></tr>').join('');
  detail(found.find(r=>r.ticker===selected));
  combo();
}
const contractLine=r=>['dd','td','leader','escalator'].includes(r.stat)?'':' '+r.threshold+'+';
function calibrationCard(c){
  if(c?.status!=='ok')return '';
  const msg=c.gain<=0?'The model adjustment did not beat the Kalshi midpoint on later games.':c.ci?.[0]>0?'The adjustment improved probability accuracy in this later sample. A profitable edge still needs a fresh test.':'The adjustment improved the point estimate, but the uncertainty interval includes no improvement.';
  const roiCI=c.roiCI?' (95% day-block interval '+pct(c.roiCI[0])+' to '+pct(c.roiCI[1])+')':'';
  const dots=c.bins.filter(b=>b.n>0).map(b=>[[b.market,'#c2fb81','Kalshi'],[b.adjusted,'#ffbd86','Adjusted']].map(([x,color,method])=>'<circle cx="'+(40+240*x)+'" cy="'+(218-180*b.actual)+'" r="5" fill="'+color+'"><title>'+method+' forecast '+pct(x)+'; actual '+pct(b.actual)+'; '+b.n+' contracts</title></circle>').join('')).join('');
  return '<div class="research-card"><div class="experiment-label">LATER GAMES / CALIBRATION TEST</div><h2>Can we improve on the current price?</h2><p>'+msg+'</p><div class="metrics">'+[card('KALSHI MIDPOINT',number(c.market,4),'Baseline Brier'),card('PRICE CALIBRATION',number(c.calibrated,4),'Learned market correction'),card('PRICE + PLAYER MODEL',number(c.augmented,4),'Correction + stat forecast'),card('PAPER ROI',pct(c.roi),c.trades+' simulated fills')].join('')+'</div>'+
    '<div class="calibration"><div><p>Fit on '+c.train+' earlier contracts; score on '+c.test+' later contracts from '+esc(c.split)+'. The model learns a small correction to Kalshi’s log-odds, with a penalty for moving too far from the market.</p><p>Paired Brier gain: '+number(c.gain,4)+(c.ci?' (95% day-block interval '+number(c.ci[0],4)+' to '+number(c.ci[1],4)+')':'')+'. Paper returns use the quoted ask plus 3¢ of assumed costs, with at least 3¢ of remaining estimated value'+roiCI+'.</p><p>This is a chronological historical split. The latest dates overlap the earlier exploratory study; a future slate is the clean confirmation.</p></div>'+
    '<figure><svg viewBox="0 0 320 260" role="img" aria-label="Observed win rate versus forecast probability"><path d="M40 38V218H280 M40 218L280 38" fill="none" stroke="#718a7a" stroke-dasharray="3 4"/><text x="40" y="24" fill="#a4b6aa" font-size="11">Actual hit rate</text><text x="40" y="241" fill="#a4b6aa" font-size="11">0%</text><text x="253" y="241" fill="#a4b6aa" font-size="11">100%</text><text x="111" y="254" fill="#a4b6aa" font-size="11">Forecast probability</text>'+dots+'</svg><figcaption class="legend"><span>Kalshi midpoint</span><span>Price + player model</span></figcaption></figure></div></div>';
}
function renderResearch(){
  const r=research,a=r?.all,s=r?.signalOnly,m=r?.model;
  const role=r?.role;
  const usage=r?.usage;
  const usageCard=usage?.status==='ok'?'<div class="research-card"><div class="experiment-label">POINTS / SHOT OPPORTUNITY</div><h2>Does the player’s shot role add an edge?</h2><p>Change in (FGA + 0.44 × FTA) per minute, scaled to recent minutes. Compares the last three appearances with the prior eight and adds the change to a forecast that already knows about minutes.</p><div class="metrics">'+[card('KALSHI',number(usage.market,5),'Baseline Brier'),card('WITHOUT SHOT ROLE',number(usage.plain,5),usage.fixed?'Market + rotation':'Market + model + rotation'),card('WITH SHOT ROLE',number(usage.withRole,5),'Same forecast plus shot opportunity'),card('INCREMENTAL GAIN',number(usage.incrementalGain,5),'Positive is better')].join('')+'</div><p>'+(usage.fixed?'Too few earlier eligible contracts to fit; test a fixed adjustment of +0.10 log-odds per four added shot opportunities. ':usage.train+' earlier contracts used to fit. ')+usage.test+' later contracts scored.'+(usage.ci?' 95% day-block interval for gain: '+number(usage.ci[0],5)+' to '+number(usage.ci[1],5)+'.':'')+' Exploratory: this historical window has already been inspected.</p></div>':'';
  const roleCard=role?.status==='ok'?'<div class="research-card"><div class="experiment-label">NEW VARIABLE / PLAYER ROLE</div><h2>Does a rotation shift add information?</h2><p>Subtract average minutes in games 4–11 from average minutes in the last three appearances. '+(role.fixed?'Too few earlier eligible contracts to fit; test a fixed adjustment of +0.08 log-odds per eight added minutes. ':role.train+' earlier contracts used to fit. ')+role.test+' later contracts scored.</p><div class="metrics">'+[card('KALSHI',number(role.market,5),'Baseline Brier'),card('WITHOUT ROTATION',number(role.plain,5),role.fixed?'Market only':'Price + player model'),card('WITH ROTATION',number(role.withRole,5),'Forecast with minutes shift'),card('INCREMENTAL GAIN',number(role.incrementalGain,5),'Positive is better')].join('')+'</div><p>'+(role.ci?'95% day-block interval for gain: '+number(role.ci[0],5)+' to '+number(role.ci[1],5)+'. ':'')+(role.marketGain>0?'The rotation version scored better than Kalshi in this sample.':'The rotation version did not beat Kalshi in this sample.')+' This follow-up uses an already inspected historical window. It needs a fresh, prospective test.</p></div>':'';
  const conclusion=!a?.n?'No qualifying historical sample yet.':a.increment<=0?'The tested movement rule did not improve on the later market quote.':a.ci?.[0]>0?'The fixed rule improved the historical score in this sample. Validate on future games.':'The fixed rule scored better in this sample, but the improvement is not established.';
  const audit=priceAudit?'<div class="research-card"><div class="experiment-label">PRICE AUDIT / POINTS</div><h2>Does price checking catch anything?</h2><p>'+priceAudit.ladders.toLocaleString()+' comparable player-minute ladders across '+priceAudit.events+' games. '+priceAudit.dominance+' dominated quote observations across '+priceAudit.dominanceEvents+' games; '+priceAudit.pairs+' two-leg pairs below $1 with the cost allowance. Repeated observations can include the same contract.</p><p>Historical candle closes share a minute bucket, but do not prove simultaneous quotes, available size, fills, or profit.</p></div>':'';
  $('#research').innerHTML=audit+calibrationCard(r?.calibration)+usageCard+roleCard+'<div class="research-card"><div class="kicker">HISTORICAL REPLAY / POINTS</div><h2>Does movement improve the forecast?</h2><p>'+conclusion+'</p>'+
  '<div class="metrics">'+[card('EARLY BRIER',number(a?.early,4),'T−90 minutes'),card('LATER BRIER',number(a?.late,4),'T−15 minutes'),card('WITH MOVEMENT',number(a?.signal,4),'Later midpoint + half the move'),card('COST-ADJUSTED ROI',pct(a?.roi),(a?.trades??0)+' hypothetical fills')].join('')+'</div>'+
  '<p>Sample: '+(a?.n??0)+' player-game contracts across '+(a?.games??0)+' games and '+(a?.days??0)+' dates. '+(r?esc(r.from)+' to '+esc(r.to)+'. ':'')+'Confirmed moves: '+(a?.confirmed??0)+'. Brier improvement over the later quote: '+number(a?.increment,4)+(a?.ci?' (95% day-block interval '+number(a.ci[0],4)+' to '+number(a.ci[1],4)+')':'')+'.</p>'+
  '<p>On confirmed moves alone: later Brier '+number(s?.late,4)+', movement-adjusted Brier '+number(s?.signal,4)+'. Hypothetical P&amp;L: $'+number(a?.pnl,2)+'; with another 1¢ cost per fill: $'+number(a?.stressPnl,2)+'.</p></div>'+
  '<div class="research-card"><h2>Does the player model add anything?</h2><p>Same-contract comparison on '+(m?.n??0)+' contracts with enough prior box scores. Lower Brier scores are better.</p><div class="metrics">'+[card('MARKET',number(m?.late,4),'Later quote'),card('MODEL',number(m?.model,4),'Historical box-score simulation'),card('BLEND',number(m?.blend,4),'75% market / 25% model'),card('BLEND + MOVEMENT',number(m?.blendMove,4),'Blend with the same move adjustment')].join('')+'</div></div>'+
  '<div class="research-card"><h2>How we test for an edge</h2><ul><li><b>Probability accuracy:</b> Brier score is the average of (forecast − outcome)². Lower is better. The paired comparison asks whether movement adds information beyond the price already available at the decision time.</li><li><b>Fixed rule:</b> Require a 4¢ midpoint move, at least 50 contracts traded between observations, and bid–ask spreads no wider than 10¢. Add half of the signed move to the later midpoint; keep all other forecasts unchanged.</li><li><b>Economic test:</b> Compare adjusted probability against the side’s ask, subtract a flat 2¢ cost, and simulate one contract only if at least 2¢ remains. Candle closes are quote proxies; depth and actual fills aren’t verified.</li><li><b>No in-game data:</b> Use quotes before scheduled tipoff. Pick one threshold per player-game by early midpoint proximity to 50%, before checking the later quote. The recent sample is exploratory; freeze rules and validate prospectively before claiming an edge.</li></ul><p>Coverage: '+(r?.listed??0)+' settled contracts fetched → '+(r?.matched??0)+' matched to games → '+(r?.earlyOpen??0)+' open at T−90 → '+(r?.distinct??0)+' selected using early quotes → '+(r?.paired??0)+' usable quote pairs → '+(a?.n??0)+' binary settlements scored.</p></div>'+
  '<div class="research-card"><h2>Player simulation</h2><p>4,000 draws resample each player’s recent game lines together, preserving relationships between stats in combos. Recent games get more weight; at least six played games are required. Probabilities are conditional on playing. This is a baseline without an injury, matchup, or lineup adjustment.</p><p>The replay does not validate the live board’s move + model agreement filter as a trading strategy.</p></div>';
}
function tab(isResearch){
  $('#board').hidden=isResearch;$('#research').hidden=!isResearch;
  $('#board-tab').setAttribute('aria-pressed',!isResearch);$('#research-tab').setAttribute('aria-pressed',isResearch);
  $('#title').innerHTML=(isResearch?'The edge test':'Three Man Weave')+'<span>.</span>';
  $('#subtitle').textContent=isResearch?'Test forecasts against the current quote, on later games and after costs.':'Player projections, market prices, and a test for what actually adds an edge.';
}
$('#board-tab').onclick=()=>tab(false);$('#research-tab').onclick=()=>tab(true);
$('#search').oninput=()=>{page=0;if(board)render();};$('#filter').onchange=()=>{page=0;if(board)render();};
$('#prev').onclick=()=>{page--;render();};$('#next').onclick=()=>{page++;render();};
$('#markets').onclick=e=>{const k=e.target.closest('button')?.dataset.market;if(k){market=k;page=0;render();$('#markets').querySelector('[aria-pressed=true]')?.focus();}};
$('#rows').onclick=e=>{const k=e.target.closest('button')?.dataset.ticker;if(k){selected=k;render();[...$('#rows').querySelectorAll('button')].find(b=>b.dataset.ticker===k)?.focus();}};
$('#detail').onclick=e=>{
  const k=e.target.closest('button')?.dataset.leg;if(!k)return;
  const r=board.rows.find(r=>r.ticker===k), msg=$('#leg-message');
  if(!r||stale||live&&Date.parse(r.start)<=Date.now())return;
  const same=legs.findIndex(x=>x.ticker===r.ticker);
  if(same>=0){msg.textContent='This leg is already in the calculator.';return;}
  if(legs.some(x=>x.start===r.start&&x.game===r.game)){msg.textContent='Choose legs from different games to avoid same-game correlation.';return;}
  if(legs.length>=3){msg.textContent='Remove a leg before adding another.';return;}
  legs.push(r);combo();$('#combo-panel').open=true;msg.textContent='Added to combo calculator.';
};
$('#legs').onclick=e=>{const n=e.target.closest('button')?.dataset.remove;if(n!==undefined){legs.splice(Number(n),1);combo();}};
$('#combo-ask').oninput=combo;
combo();
async function json(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error(path+' unavailable');return r.json();}
const [b,r,a]=await Promise.allSettled([json('data/board.json'),json('data/research.json'),json('data/price-audit.json')]);
research=r.value;priceAudit=a.value;renderResearch();
if(b.status==='fulfilled'){board=b.value;live=board.mode==='live';render();}
else{$('#feed').textContent='UNAVAILABLE';$('#notice').textContent='Board data could not load. Start the project server rather than opening the HTML file directly.';}
setInterval(async()=>{
  if(document.hidden||!live)return;
  try{const next=await json('data/board.json');if(next.mode==='live')board=next;}catch{}
  render();
},60000);
