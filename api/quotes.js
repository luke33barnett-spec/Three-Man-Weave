const URL_BASE='https://external-api.kalshi.com/trade-api/v2/markets';
const tickerPattern=/^KXNBAPTS-[A-Z0-9]{8,30}-[A-Z0-9]{3,40}-\d{1,3}$/;
const number=x=>x===null||x===''||x===undefined||!Number.isFinite(Number(x))?null:Number(x);
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request){
  const tickers=[...new Set((new URL(request.url).searchParams.get('tickers')??'').split(','))];
  if(tickers.length>48||tickers.some(t=>!tickerPattern.test(t)))return response({error:'Choose up to 48 NBA points contracts.'},400);
  const url=new URL(URL_BASE);
  url.search=new URLSearchParams({tickers:tickers.join(','),limit:tickers.length}).toString();
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(7500)});
    if(!r.ok)return response({error:'Kalshi quotes are temporarily unavailable. Try again shortly.'},r.status===429?429:502);
    const data=await r.json();
    if(!Array.isArray(data.markets))return response({error:'Unexpected quote response.'},502);
    const allowed=new Set(tickers),at=new Date().toISOString();
    const quotes=Object.fromEntries(data.markets.filter(m=>allowed.has(m.ticker)&&['active','open'].includes(m.status)).map(m=>[m.ticker,{
      at,bid:number(m.yes_bid_dollars),ask:number(m.yes_ask_dollars),depth:number(m.yes_ask_size_fp),bidDepth:number(m.yes_bid_size_fp)
    }]));
    return response({at,quotes});
  }catch{return response({error:'Could not reach Kalshi. Try again shortly.'},502);}
}
