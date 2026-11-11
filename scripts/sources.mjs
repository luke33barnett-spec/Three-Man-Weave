import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
export const K='https://external-api.kalshi.com/trade-api/v2';
export const E='https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
export const SERIES={KXNBAPTS:'pts',KXNBAREB:'reb',KXNBAAST:'ast',KXNBA3PT:'threes',KXNBASTL:'stl',KXNBABLK:'blk',KXNBA2D:'dd',KXNBA3D:'td',KXNBAPTSLEADER:'leader',KXNBAPRA:'pra',KXNBAESCALATORPTS:'escalator'};
export const ET=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
export const key=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let kalshiQueue=Promise.resolve();
export async function get(base,path,params={}){
  const u=new URL(base+path);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
  const fetchJson=async()=>{
    for(let i=0;i<3;i++){
      const r=await fetch(u,{signal:AbortSignal.timeout(15000)});
      if(r.ok)return r.json();
      if(r.status!==429||i===2)throw Error(u.hostname+' '+path+' HTTP '+r.status);
      const retry=r.headers.get('retry-after');
      const ms=retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Date.parse(retry)-Date.now()):1500*(i+1);
      if(ms>30000)throw Error(u.hostname+' asked for a longer rate-limit pause');
      await delay(Math.max(1000,ms||0));
    }
  };
  if(base!==K)return fetchJson();
  const job=kalshiQueue.then(fetchJson);
  kalshiQueue=job.catch(()=>{}).then(()=>delay(800));
  return job;
}
export const read=async(p,d)=>{try{return JSON.parse(await readFile(p,'utf8'))}catch(e){if(e.code==='ENOENT')return d;throw e}};
export async function save(p,d){const tmp=p+'.'+process.pid+'.tmp';await mkdir(p.slice(0,p.lastIndexOf('/')),{recursive:true});await writeFile(tmp,JSON.stringify(d));await rename(tmp,p);}
export async function pool(items,limit,fn){
  const out=[];let i=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(i<items.length){const j=i++;out[j]=await fn(items[j]);}}));
  return out;
}
const alias={NY:'NYK',GS:'GSW',NO:'NOP',SA:'SAS',UTAH:'UTA',WSH:'WAS',BKN:'BKN',PHX:'PHX'};
const dateCode=iso=>{const d=ET.format(new Date(iso)),[y,m,day]=d.split('-');return y.slice(2)+['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(m)-1]+day;};
export function gamesFrom(payload){
  if(!Array.isArray(payload.events))throw Error('Scoreboard schema changed');
  return payload.events.flatMap(e=>{
    const ts=e.competitions?.[0]?.competitors??[],a=ts.find(t=>t.homeAway==='away')?.team,h=ts.find(t=>t.homeAway==='home')?.team;
    if(!a||!h||!Number.isFinite(Date.parse(e.date)))return [];
    const code=t=>alias[t.abbreviation]??t.abbreviation;
    return [{id:e.id,start:e.date,completed:e.status?.type?.completed===true,tag:dateCode(e.date)+code(a)+code(h),label:a.abbreviation+' @ '+h.abbreviation}];
  });
}
export async function schedule(from,to){
  const days=[];
  for(let t=Date.parse(from);t<=Date.parse(to);t+=86400000)days.push(new Date(t).toISOString().slice(0,10).replaceAll('-',''));
  const cache=await read('state/schedule.json',{});
  const old=ET.format(new Date(Date.now()-3*86400000)).replaceAll('-','');
  const games=(await pool(days,4,async dates=>{
    if(dates<old&&cache[dates])return cache[dates];
    const games=gamesFrom(await get(E,'/scoreboard',{dates}));
    if(dates<old&&games.every(g=>g.completed))cache[dates]=games;
    return games;
  })).flat();
  await save('state/schedule.json',cache);
  return [...new Map(games.map(g=>[g.id,g])).values()];
}
export function parseBox(j,g){
  if(!Array.isArray(j.boxscore?.players))throw Error('Box score schema changed');
  // Conservative availability proxy for finalized historical boxes; exclude same-game data.
  const availableAt=new Date(Date.parse(g.start)+6*3600000).toISOString();
  return j.boxscore.players.flatMap(t=>(t.statistics??[]).flatMap(s=>(s.athletes??[]).flatMap(a=>{
    if(a.didNotPlay||!a.athlete?.displayName)return [];
    const field=(...names)=>{const i=s.keys.findIndex(k=>names.includes(k));return a.stats?.[i];};
    const min=String(field('minutes')).split(':').reduce((sum,x,i)=>sum+Number(x)/(i?60:1),0);
    const row={name:a.athlete.displayName,playerId:String(a.athlete.id??''),gameId:g.id,start:g.start,availableAt,min};
    const vals={pts:field('points'),reb:field('rebounds'),ast:field('assists'),stl:field('steals'),blk:field('blocks'),tov:field('turnovers'),threes:field('threePointFieldGoalsMade-threePointFieldGoalsAttempted','threePointFieldGoalsMade','threePointFieldGoals')?.split('-')[0]};
    if(!(min>0)||Object.values(vals).some(x=>x==null||String(x).trim()===''||!Number.isInteger(Number(x))||Number(x)<0))return [];
    for(const [k,v] of Object.entries(vals))row[k]=Number(v);
    const attempts=x=>typeof x==='string'&&/^\d+-\d+$/.test(x)?Number(x.split('-')[1]):null;
    row.fga=attempts(field('fieldGoalsMade-fieldGoalsAttempted'));
    row.fta=attempts(field('freeThrowsMade-freeThrowsAttempted'));
    return [row];
  })));
}
export async function loadLogs(games){
  const cache=await read('state/boxes-v2.json',{});
  const finals=games.filter(g=>g.completed);
  let failed=0;
  await pool(finals.filter(g=>!cache[g.id]?.length),4,async g=>{
    try{cache[g.id]=parseBox(await get(E,'/summary',{event:g.id}),g);}catch{failed++;}
  });
  await save('state/boxes-v2.json',cache);
  return {logs:finals.flatMap(g=>cache[g.id]??[]),failed};
}
export async function list(series,status,pages=4,filters={}){
  const out=[];let cursor='';
  for(let i=0;i<pages;i++){
    const j=await get(K,'/markets',{series_ticker:series,status,limit:1000,...filters,...(cursor?{cursor}:{})});
    if(!Array.isArray(j.markets))throw Error('Market schema changed');
    out.push(...j.markets);cursor=j.cursor;if(!cursor)break;
  }
  return {markets:out,truncated:!!cursor};
}
const num=x=>x==null||x===''?null:Number.isFinite(Number(x))?Number(x):null;
export function normalize(m,series,games,at){
  const stat=SERIES[series],tag=m.event_ticker?.slice(series.length+1);
  const found=games.filter(g=>g.tag===tag);
  if(!stat||found.length!==1||!m.event_ticker.startsWith(series+'-'))return null;
  const game=found[0],primary=m.rules_primary??'', secondary=m.rules_secondary??'';
  if(m.market_type!=='binary')return null;
  let player,threshold,payout;
  if(stat==='escalator'){
    const c=m.custom_strike??{};
    const [floor,cap,step,exponent]=['scalar_floor','scalar_cap','scalar_step','exponent'].map(k=>Number(c[k]));
    if(m.strike_type!=='custom'||c.statistic!=='points'||c.scalar_payout_type!=='capped_centicent'||floor!==0||
      ![cap,step,exponent].every(v=>Number.isInteger(v)&&v>0)||cap>100||cap%step||exponent>8||
      c['Payout formula']!=='floor(10000 x (y / '+cap+')^'+exponent+') / 10000'||
      c.y!=='min('+cap+', max(0, '+step+' x floor(s / '+step+')))')return null;
    const name=/pays per points recorded by (.+?) in the /i.exec(primary)?.[1];
    if(!name||key(name)!==key(m.yes_sub_title))return null;
    player=name;threshold=0;payout={floor,cap,step,exponent};
  }else if(stat==='dd'||stat==='td'||stat==='leader'){
    const phrase=stat==='dd'?'a double double':stat==='td'?'a triple double':'the most points';
    const foundName=new RegExp('^If (.+?) records '+phrase+' in .+ then the market resolves to Yes\\.$','i').exec(primary);
    if(!foundName||key(foundName[1])!==key(m.yes_sub_title))return null;
    if(stat==='leader'){
      if(m.strike_type!=='structured'||!secondary.includes('$1/N'))return null;
    }else if(m.strike_type!=='greater'||Number(m.floor_strike)!==.5||!secondary.includes('points, rebounds, assists, steals, and blocks'))return null;
    player=foundName[1];threshold=1;
  }else{
    const p=/^(.+?):\s*(\d+)\+/.exec(m.yes_sub_title??m.title??'');
    if(!p||m.strike_type!=='greater'||Math.abs(Number(m.floor_strike)-(Number(p[2])-.5))>1e-6||!Number.isFinite(Number(m.floor_strike)))return null;
    if(!/^If .+ records \d+\+ .+ then the market resolves to Yes\.$/i.test(primary))return null;
    player=p[1];threshold=Number(p[2]);
  }
  return {ticker:m.ticker,series,stat,player,threshold,game,payout,
    opened:m.open_time,rules:m.rules_primary,result:m.result,settlement:num(m.settlement_value_dollars),
    quote:{at,bid:num(m.yes_bid_dollars),ask:num(m.yes_ask_dollars),volume:num(m.volume_fp),depth:num(m.yes_ask_size_fp),bidDepth:num(m.yes_bid_size_fp)}};
}
export function playerLog(logs,name){
  const rows=logs.filter(g=>key(g.name)===key(name));
  return new Set(rows.map(r=>r.playerId)).size===1?rows:[];
}
