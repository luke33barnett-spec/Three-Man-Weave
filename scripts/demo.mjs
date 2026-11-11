import {save} from './sources.mjs';
import {MARKETS,simulate,distribution,rotationShift,shotOpportunity} from '../public/model.mjs';
const at='2026-11-11T20:00:00Z', start='2026-11-12T01:00:00Z';
const players=['Miles Carter','Devin Brooks','Jalen Moreno','Theo Bennett','Isaiah Stone','Marcus Fields'];
const rows=Object.keys(MARKETS).flatMap((stat,i)=>{
  const player=players[i%players.length], threshold=[24,6,9,3,2,2,1,1,1,38,0][i];
  const log=Array.from({length:24},(_,j)=>({availableAt:new Date(Date.parse(at)-(j+1)*86400000).toISOString(),min:29+j%12,pts:12+(j*7+i*3)%27,reb:3+(j*3+i)%12,ast:2+(j*5+i)%10,stl:(j+i)%4,blk:(j*3+i)%3,threes:(j*5+i)%6,tov:(j*7+i)%5,fga:12+(j*3+i)%13,fta:2+(j+i)%7}));
  const sim=simulate(log,at,null,player);
  const payout=stat==='escalator'?{floor:0,cap:50,step:2,exponent:3}:undefined;
  const projection=distribution(sim,stat,threshold,payout);
  const center=Math.min(.88,Math.max(.12,(projection?.yes??projection?.expectedPayout??.35)+((i%4)-1.8)*.045));
  const shift=[.08,-.06,.015,.055,-.035,.07][i%6];
  const history=Array.from({length:7},(_,j)=>{
    const m=center-shift*(6-j)/6;
    return {at:new Date(Date.parse(at)-(6-j)*30*60000).toISOString(),bid:m-.027,ask:m+.027,volume:80+j*(i%4===2?4:38),depth:70+j*3,bidDepth:48+j*2};
  });
  const row={ticker:'DEMO-'+i,series:'DEMO-'+stat,stat,player,threshold,game:['NYK @ MIL','PHI @ CLE','DAL @ DEN'][i%3],start,quote:history.at(-1),history,payout,projection,sample:projection?sim.n:0,minutes:projection?sim.minutes:null,role:projection?rotationShift(log,at):null,usage:['pts','escalator'].includes(stat)?shotOpportunity(log,at):null};
  return stat==='pts'?[row,...[20,15].map(t=>{
    const shift=t===20?-.06:.14;
    const quote={...row.quote,bid:Math.min(.94,Math.max(.01,row.quote.bid+shift)),ask:Math.min(.99,Math.max(.04,row.quote.ask+shift))};
    return {...row,ticker:'DEMO-PTS-'+t,threshold:t,projection:distribution(sim,stat,t),quote,history:[...row.history.slice(0,-1),quote]};
  })]:[row];
});
await save('public/data/board.json',{mode:'demo',at,rows,warnings:[]});
