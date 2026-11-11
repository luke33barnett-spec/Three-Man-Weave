import {readdir} from 'node:fs/promises';
import {read,save} from './sources.mjs';
import {checkThresholds} from '../public/price-check.mjs';
const dir='state/candles';
const files=(await readdir(dir)).filter(f=>/^[0-9]{2}[A-Z]{3}\d{2}[A-Z0-9]+-\d+\.json$/.test(f));
let ladders=0,minutes=0,events=0,dominance=0,pairs=0;
let dominanceEvents=0,pairEvents=0,persistentPairs=0;
for(const f of files){
  const [game,late]=f.slice(0,-5).split('-'), cutoff=Number(late);
  const start=new Date((cutoff+15*60)*1000).toISOString();
  const data=await read(dir+'/'+f);
  const byMinute=new Map();
  data.market_tickers?.forEach((ticker,i)=>{
    const match=new RegExp('^KXNBAPTS-'+game+'-([A-Z0-9]+)-(\\d+)$').exec(ticker);
    if(!match)return;
    for(const c of data.market_candlesticks?.[i]??[]){
      if(!Number.isInteger(c.end_period_ts)||c.end_period_ts>cutoff||c.end_period_ts<cutoff-105*60)continue;
      const at=c.end_period_ts, rows=byMinute.get(at)??[];
      rows.push({ticker,stat:'pts',series:'KXNBAPTS',player:match[1],game,start,threshold:Number(match[2]),quote:{
        at,bid:Number(c.yes_bid?.close_dollars),ask:Number(c.yes_ask?.close_dollars)
      }});
      byMinute.set(at,rows);
    }
  });
  let sawEvent=false,sawDominance=false,sawPair=false,previous=new Map();
  for(const [at,rows] of [...byMinute.entries()].sort((a,b)=>a[0]-b[0])){
    const result=checkThresholds(rows,{requireSize:false});
    if(!result.ladders)continue;
    sawEvent=true;minutes++;ladders+=result.ladders;
    dominance+=result.dominated.length;pairs+=result.pairs.length;
    if(result.dominated.length)sawDominance=true;
    if(result.pairs.length)sawPair=true;
    for(const {yes,no} of result.pairs){
      const id=yes.row.ticker+'|'+no.row.ticker;
      if(previous.get(id)===at-60)persistentPairs++;
      previous.set(id,at);
    }
  }
  events+=Number(sawEvent);dominanceEvents+=Number(sawDominance);pairEvents+=Number(sawPair);
}
const summary={source:'Kalshi historical points candles; same minute bucket, sizes unavailable',events,minutes,ladders,dominance,pairs,dominanceEvents,pairEvents,persistentPairs};
await save('public/data/price-audit.json',summary);
console.log(JSON.stringify(summary,null,2));
