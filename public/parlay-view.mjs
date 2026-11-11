import {MARKETS} from './model.mjs';
import {formatMultiple,readMultiple} from './payout.mjs';
import {parlayIdeas} from './parlays.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const pct=x=>(100*x).toFixed(0)+'%';
const storageKey='three-man-weave-combo-quotes-v1';
function saved(){
  try{return JSON.parse(localStorage.getItem(storageKey))??{};}catch{return {};}
}
const legText=l=>{
  if(l.stat==='dd'||l.stat==='td')return l.player+' · '+(l.side==='YES'?'':'No ')+MARKETS[l.stat][0];
  return l.player+' · '+(l.side==='YES'?l.threshold+'+':l.threshold-1+' or fewer')+' '+MARKETS[l.stat][0].toLowerCase();
};
export function parlayView(root,slate,day,now,fresh,demo,nights){
  const today=nights.find(n=>n.day===day);
  const ideas=today?today.ideas.filter(p=>Date.parse(p.firstTip)>now):fresh?parlayIdeas(slate):[];
  const quotes=saved();
  const graded=nights.flatMap(n=>n.ideas.map(p=>({...p,day:n.day}))).filter(p=>p.status!=='pending');
  const binary=graded.filter(p=>p.status!=='fractional'), wins=binary.filter(p=>p.status==='win').length;
  const priced=graded.filter(p=>quotes[p.day+'|'+p.id]?.meetsTarget);
  const pnl=priced.reduce((s,p)=>s+p.payout*quotes[p.day+'|'+p.id].multiple-1,0);
  root.innerHTML=(ideas.length?'<div class="parlay-grid">'+ideas.map((p,i)=>{
    const logged=quotes[day+'|'+p.id], enabled=!!today&&!demo&&!logged;
    return '<article class="research-card combo-suggestion" data-parlay="'+i+'"><div class="kicker">'+(today?'NIGHTLY CARD':demo?'SAMPLE PARLAY':'EARLY IDEA')+' · '+(i+1)+'</div>'+
      '<ol class="combo-legs">'+p.legs.map(l=>'<li><div><strong>'+esc(legText(l))+'</strong><small>'+esc(l.game)+'</small></div><span>'+pct(l.prob)+'</span></li>').join('')+'</ol>'+
      '<div class="pick-price"><span>Look for at least <b class="up">'+formatMultiple(p.minimum)+'</b></span><span>Model hit chance <b>'+pct(p.chance)+'</b></span></div>'+
      '<label class="actual-combo">Payout in Kalshi <input data-multiple type="text" inputmode="decimal" maxlength="12" placeholder="e.g. 2.20×"'+(logged?' value="'+esc(formatMultiple(logged.multiple))+'"':'')+'></label>'+
      '<p data-feedback class="small" aria-live="polite">'+(logged?'Saved '+esc(formatMultiple(logged.multiple))+' for paper tracking.':'')+'</p>'+
      (enabled?'<button type="button" class="paper-save" data-save>Save quote for testing</button>':'')+'</article>';
  }).join('')+'</div>':'<div class="research-card"><p>'+(fresh?'No qualifying two-leg ideas remain on this slate.':'Refresh prices or wait for the nightly card.')+'</p></div>')+
    '<p class="small">Different games only. Model hit chances assume the legs are independent. Kalshi may not offer every combo. Save the total payout for the exact combo, with fees reflected, to test returns.</p>'+
    '<details class="research-card"><summary>Parlay paper results · '+graded.length+' graded</summary><p>'+wins+' wins / '+binary.length+' full outcomes · '+(graded.length-binary.length)+' partial payouts. '+(priced.length?'At saved quotes that met the target: '+priced.length+' graded · '+(pnl>=0?'+':'')+'$'+Math.abs(pnl).toFixed(2)+' per $1 staked per combo.':'No settled combos with saved quotes meeting the target yet.')+'</p><p>All locked ideas are graded. Only quotes you saved before tipoff count toward dollar results; fills are simulated.</p>'+
    (graded.length?'<ul>'+[...graded].reverse().slice(0,12).map(p=>'<li>'+esc(p.day)+' · '+p.legs.map(l=>esc(legText(l))).join(' + ')+' · '+esc(p.status)+'</li>').join('')+'</ul>':'')+'</details>';
  for(const el of root.querySelectorAll('[data-parlay]')){
    const p=ideas[Number(el.dataset.parlay)],input=el.querySelector('[data-multiple]'),msg=el.querySelector('[data-feedback]');
    const check=()=>{
      const value=readMultiple(input.value);
      msg.textContent=!input.value.trim()?'':value===null?'Enter a multiplier like 2.20×.':value>=p.minimum?'Meets the model’s minimum payout.':'Pass at '+formatMultiple(value)+' — look for '+formatMultiple(p.minimum)+' or higher.';
      return value;
    };
    input.oninput=check;
    const save=el.querySelector('[data-save]');
    if(save)save.onclick=()=>{
      const value=check();
      if(value===null){msg.textContent='Enter the exact payout Kalshi is showing.';return;}
      if(Date.now()>=Date.parse(p.firstTip)){msg.textContent='Too late to save a pregame quote.';return;}
      const k=day+'|'+p.id, data=saved();
      if(data[k]){msg.textContent='A quote is already saved for this combo.';return;}
      data[k]={multiple:value,at:new Date().toISOString(),meetsTarget:value>=p.minimum};
      try{localStorage.setItem(storageKey,JSON.stringify(data));save.disabled=true;msg.textContent='Saved '+formatMultiple(value)+' for paper tracking.';}
      catch{msg.textContent='This browser could not save the quote.';}
    };
  }
}
