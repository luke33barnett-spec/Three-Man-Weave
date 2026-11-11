import test from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../api/quotes.js';
test('quote endpoint rejects arbitrary input and returns only requested open point quotes',async t=>{
  assert.equal((await GET(new Request('http://localhost/api/quotes?tickers=https://example.com'))).status,400);
  const ticker='KXNBAPTS-26NOV11SASCHI-CHIMBUZELIS14-25';
  const quote={ticker,status:'active',yes_bid_dollars:'.38',yes_ask_dollars:'.42',yes_ask_size_fp:'10',yes_bid_size_fp:'4'};
  const stub=t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url.hostname,'external-api.kalshi.com');
    assert.equal(url.searchParams.get('tickers'),ticker);
    return Response.json({markets:[quote,{...quote,ticker:'other'}]});
  });
  const r=await GET(new Request('http://localhost/api/quotes?tickers='+ticker));
  const body=await r.json();
  assert.equal(stub.mock.callCount(),1);
  assert.deepEqual(Object.keys(body.quotes),[ticker]);
  assert.equal(body.quotes[ticker].ask,.42);
  assert.equal(r.headers.get('cache-control'),'no-store');
});
