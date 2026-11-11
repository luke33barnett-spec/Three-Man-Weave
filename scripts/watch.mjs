import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const interval=5*60_000;
console.log('Refreshing pregame snapshots every five minutes. Ctrl+C stops the collector.');
for(;;){
  const start=Date.now();
  await new Promise(resolve=>{
    const p=spawn(process.execPath,['scripts/refresh.mjs'],{stdio:'inherit'});
    p.once('error',e=>{console.error(e.message);resolve();});
    p.once('exit',code=>{if(code)console.error('Refresh failed; previous board retained.');resolve();});
  });
  await delay(Math.max(1000,interval-(Date.now()-start)));
}
