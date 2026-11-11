import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {GET as getQuotes} from '../api/quotes.js';
const base=new URL('../public/',import.meta.url);
const mime={html:'text/html',css:'text/css',mjs:'text/javascript',json:'application/json',svg:'image/svg+xml'};
createServer(async (req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/api/quotes'&&req.method==='GET'){
      const result=await getQuotes(new Request('http://localhost'+req.url));
      res.writeHead(result.status,Object.fromEntries(result.headers)).end(await result.text());
      return;
    }
    const file=new URL(path==='/'?'index.html':path.slice(1),base);
    if(!file.href.startsWith(base.href)||!mime[file.pathname.split('.').at(-1)]){res.writeHead(404).end();return;}
    const body=await readFile(file);
    res.writeHead(200,{'content-type':mime[file.pathname.split('.').at(-1)],'cache-control':'no-store'}).end(body);
  }catch{res.writeHead(404).end('Not found');}
}).listen(Number(process.env.PORT??3010),'127.0.0.1',()=>console.log('Three Man Weave: http://127.0.0.1:'+(process.env.PORT??3010)));
