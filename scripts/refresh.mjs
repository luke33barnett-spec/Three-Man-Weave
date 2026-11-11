import {SERIES,ET,schedule,loadLogs,list,normalize,playerLog,pool,read,save} from './sources.mjs';
import {simulate,distribution,rotationShift,shotOpportunity} from '../public/model.mjs';
const now=new Date(), at=now.toISOString(), day=n=>ET.format(new Date(+now+n*86400000));
const scheduleRows=await schedule(day(-27),day(1));
const games=scheduleRows.filter(g=>!g.completed&&Date.parse(g.start)>+now&&Date.parse(g.start)<+now+30*3600000);
const warnings=[];
const markets=(await pool(Object.keys(SERIES),2,async series=>{
  try{
    const r=await list(series,'open',2);
    if(r.truncated)warnings.push(series+' listing capped');
    return r.markets.map(m=>normalize(m,series,games,at)).filter(Boolean);
  }catch(e){warnings.push(e.message);return [];}
})).flat();
if(!markets.length&&warnings.length)throw Error('No matched markets; feed errors: '+warnings.join('; '));
const {logs,failed}=await loadLogs(scheduleRows);
if(failed)warnings.push(failed+' box scores unavailable');
const prior=await read('state/quotes.json',{});
for(const [ticker,history] of Object.entries(prior))if(Date.parse(history.at(-1)?.at)<+now-3*86400000)delete prior[ticker];
const sims=new Map(), rows=[];
for(const {ticker,series,stat,player,threshold,game,quote,payout} of markets){
  const id=player+'|'+game.id;
  if(stat!=='leader'&&!sims.has(id)){
    const log=playerLog(logs,player);
    sims.set(id,{sim:simulate(log,at,null,id),role:rotationShift(log,at),usage:shotOpportunity(log,at)});
  }
  const profile=stat==='leader'?null:sims.get(id),sim=profile?.sim;
  const history=prior[ticker]=[...(prior[ticker]??[]).filter(q=>Date.parse(q.at)<+now&&Date.parse(q.at)>+now-25*3600000),quote].slice(-100);
  rows.push({ticker,series,stat,player,threshold,game:game.label,start:game.start,quote,history,payout,
    projection:distribution(sim,stat,threshold,payout),sample:sim?.n??0,minutes:sim?.minutes??null,role:profile?.role??null,
    usage:['pts','escalator'].includes(stat)?profile?.usage??null:null});
}
await save('state/quotes.json',prior);
await save('public/data/board.json',{mode:'live',at,warnings,rows});
console.log('Matched '+rows.length+' pregame contracts across '+games.length+' scheduled games; '+logs.length+' stat lines; '+rows.filter(r=>r.projection).length+' projections.');
if(warnings.length)console.log(warnings.join('; '));
