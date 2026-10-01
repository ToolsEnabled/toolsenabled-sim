import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyTrajectory} from './sim.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function serveReplay({run,port=0}){
 if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid replay port');
 const path=join(run,'trajectory.jsonl');if((await stat(path)).size>256*1024*1024)throw new Error('Trajectory exceeds bounded capture size');
 const input=await readFile(path,'utf8'),checked=verifyTrajectory(input);
 const assets=new Map([
  ['/',[join(root,'src/renderer/index.html'),'text/html']],['/renderer/page.mjs',[join(root,'src/renderer/page.mjs'),'text/javascript']],['/renderer/glyphs.mjs',[join(root,'src/renderer/glyphs.mjs'),'text/javascript']],
  ['/vendor/three.module.js',[join(root,'node_modules/three/build/three.module.js'),'text/javascript']],['/vendor/three.core.js',[join(root,'node_modules/three/build/three.core.js'),'text/javascript']]
 ]);
 const prefix='/replay/'+randomBytes(32).toString('hex')+'/';
 const server=http.createServer(async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${server.address().port}`||req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${server.address().port}`){res.writeHead(403);res.end();return;}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(!req.url.startsWith(prefix)){res.writeHead(401);res.end();return;}
  const route='/'+req.url.slice(prefix.length);
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'");
  if(route==='/trajectory.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(checked.records));return;}
  const item=assets.get(route);if(!item){res.writeHead(404);res.end();return;}try{res.setHeader('Content-Type',item[1]);res.end(await readFile(item[0]));}catch{res.writeHead(500);res.end();}
 });
 await new Promise((r,j)=>{server.once('error',j);server.listen(port,'127.0.0.1',r);});
 return {url:`http://127.0.0.1:${server.address().port}${prefix}`,input,checked,async close(){server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),i=args.indexOf('--run'),p=args.indexOf('--port');if(i<0)throw new Error('Usage: node src/replay-server.mjs --run RUN [--port 0]');
 const page=await serveReplay({run:resolve(args[i+1]),port:p<0?0:Number(args[p+1])});console.log(JSON.stringify({url:page.url,hook:'renderAt',metadataHook:'studioRasterMetadata'}));
 for(const sig of ['SIGINT','SIGTERM','SIGHUP'])process.on(sig,async()=>{await page.close();process.exit(0);});
}
