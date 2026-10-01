import {readConnection} from './private-files.mjs';
const path=process.env.SIM_CONNECTION;
if(!path){process.stderr.write('Set SIM_CONNECTION to a private connection file created by the sim hub.\n');process.exit(1);}
let config;
try{config=JSON.parse(readConnection(path));const u=new URL(config.url);if(u.hostname!=='127.0.0.1'||u.protocol!=='http:'||u.pathname!=='/'||u.username||u.password||u.search||u.hash||!Number.isInteger(Number(u.port))||!/^[a-f0-9]{64}$/.test(config.token))throw new Error('Invalid connection');}catch{process.stderr.write('Invalid SIM_CONNECTION file.\n');process.exit(1);}
let initialized=false,buffer='',pending=Promise.resolve(),queued=0,drainExpired=false;
const drain=new AbortController();
const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
const error=(id,code,message)=>send({jsonrpc:'2.0',id,error:{code,message}});
async function handle(line){
 let msg;try{msg=JSON.parse(line);}catch{error(null,-32700,'Parse error');return;}
 const validId=typeof msg?.id==='string'||(typeof msg?.id==='number'&&Number.isFinite(msg.id));
 if(!msg||Array.isArray(msg)||msg.jsonrpc!=='2.0'||typeof msg.method!=='string'||(Object.hasOwn(msg,'id')&&!validId)){error(validId?msg.id:null,-32600,'Invalid Request');return;}
 if(!Object.hasOwn(msg,'id'))return;
 if(drainExpired){error(msg.id,-32000,'Input closed before request completed');return;}
 if(msg.method==='ping'){send({jsonrpc:'2.0',id:msg.id,result:{}});return;}
 if(msg.method==='initialize'){
  if(initialized){error(msg.id,-32600,'Already initialized');return;}
  initialized=true;send({jsonrpc:'2.0',id:msg.id,result:{protocolVersion:['2024-11-05','2025-03-26','2025-06-18'].includes(msg.params?.protocolVersion)?msg.params.protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'toolsenabled-sim',version:'0.1.0'},instructions:'Robot controls are bound to this connection. Read sim.status first. In live mode, use its live.round on every robot command, then call robot.submit once to finish the round. The launcher advances after all active robots submit or its deadline expires. In manual mode the coordinator calls sim.step.'}});return;
 }
 if(!initialized){error(msg.id,-32002,'Initialize first');return;}
 if(!['tools/list','tools/call'].includes(msg.method)){error(msg.id,-32601,'Method not found');return;}
 try{
  const response=await fetch(config.url+'/call',{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify({method:msg.method,params:msg.params}),signal:AbortSignal.any([AbortSignal.timeout(10000),drain.signal])});
  if(!response.ok){const [code,message]=({413:[-32006,'Request too large for simulation hub'],429:[-32005,'Capability request quota exceeded'],401:[-32001,'Connection capability refused'],403:[-32001,'Connection capability or origin refused']})[response.status]||[-32000,`Simulation hub refused HTTP ${response.status}`];error(msg.id,code,message);return;}
  const body=await response.json();
  if(msg.method==='tools/list'){if(body.error)throw new Error(body.error);send({jsonrpc:'2.0',id:msg.id,result:body.result});}
  else send({jsonrpc:'2.0',id:msg.id,result:body.error?{isError:true,content:[{type:'text',text:body.error}]}:{content:[{type:'text',text:JSON.stringify(body.result)}],structuredContent:{result:body.result}}});
 }catch{error(msg.id,-32000,'Simulation hub unavailable or request refused');}
}
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
 buffer+=chunk;
 while(buffer.includes('\n')){const end=buffer.indexOf('\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(Buffer.byteLength(line)>262144){error(null,-32600,'Frame too large');process.stdin.destroy();return;}if(line.trim()){if(queued>=32){let id;try{id=JSON.parse(line).id;}catch{}if(id!==undefined)error(id,-32005,'Too many pending requests');}else{queued++;pending=pending.then(()=>handle(line)).finally(()=>queued--);}}}
 if(Buffer.byteLength(buffer)>262144){error(null,-32600,'Frame too large');process.stdin.destroy();}
});
process.stdin.on('end',()=>{const deadline=setTimeout(()=>{drainExpired=true;drain.abort();},2000);pending.finally(()=>{clearTimeout(deadline);if(buffer.trim())error(null,-32700,'Truncated frame');process.exitCode=0;});});
process.on('SIGTERM',()=>process.exit(0));process.on('SIGINT',()=>process.exit(0));

process.on('SIGHUP',()=>process.exit(0));
