import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdirSync,openSync,closeSync,writeSync,writeFileSync,readFileSync,readdirSync,unlinkSync,realpathSync,lstatSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createSim,validateScenario,validateAssignments} from './sim.mjs';
import {privateRoot} from './private-files.mjs';
import {fairScheduler} from './scheduler.mjs';
import {createLive,liveOptions} from './live.mjs';
import {toolList,validateCall} from './schema.mjs';
export const defaultScenario=()=>JSON.parse(readFileSync(new URL('../scenarios/warehouse.json',import.meta.url)));
export const defaultAssignments=scene=>scene.robots.map((r,i)=>({robotId:r.id,agentId:`script-${r.id}`,crateId:scene.crates[i].id,taskId:`script-task-${r.id}`,ledgerId:`script-ledger-${r.id}`}));
export async function startHub({root,scenario=defaultScenario(),assignments=defaultAssignments(scenario),maxTicks=36000,maxRunBytes=128*1024*1024,live}={}){
 const liveConfig=liveOptions(live,scenario);
 if(!root)throw new Error('A private run root is required');
 mkdirSync(root,{recursive:true,mode:0o700});root=privateRoot(root);
 const lockPath=join(root,'hub.lock'),lock=openSync(lockPath,'wx',0o600);writeSync(lock,`${process.pid}\n`);
 let sim,recordFd,actionFd,liveFd,liveControl,runDir,server,broken=false,closed=false;let sequence=0;
 const capabilities=new Map(),connections={};
 try{
  async function newRun(s,a){
   s=validateScenario(s);a=validateAssignments(a,s);
   // The robot-to-agent mapping remains stable for this hub's client capabilities.
   if(sim&&JSON.stringify(a.map(x=>[x.robotId,x.agentId,x.driverLabel]))!==JSON.stringify(sim.header.assignments.map(x=>[x.robotId,x.agentId,x.driverLabel])))throw new Error('Restart the hub to change the stable agent mapping');
   const next=await createSim({scenario:s,assignments:a,maxTicks,maxRunBytes,retainLog:false,live:!!liveConfig});
   let index=1;while(existsSync(join(root,`run-${String(index).padStart(4,'0')}`)))index++;
   const dir=join(root,`run-${String(index).padStart(4,'0')}`);mkdirSync(dir,{mode:0o700});
   let rf,af,lf;
   try{
    if(liveConfig)lf=openSync(join(dir,'live.jsonl'),'wx',0o600);
    rf=openSync(join(dir,'trajectory.jsonl'),'wx',0o600);af=openSync(join(dir,'actions.jsonl'),'wx',0o600);
    writeFileSync(join(dir,'scenario.json'),JSON.stringify(s,null,2)+'\n',{flag:'wx',mode:0o600});
    writeFileSync(join(dir,'work-record.json'),JSON.stringify({version:1,assignments:a},null,2)+'\n',{flag:'wx',mode:0o600});
    // Re-create with append sinks after successful validation/allocation.
    next.close();const fresh=await createSim({scenario:s,assignments:a,maxTicks,maxRunBytes,retainLog:false,live:!!liveConfig,onRecord:line=>writeSync(rf,line),onAction:line=>writeSync(af,line)});
    if(sim)sim.close();if(recordFd!==undefined)closeSync(recordFd);if(actionFd!==undefined)closeSync(actionFd);if(liveFd!==undefined)closeSync(liveFd);
    sim=fresh;liveFd=lf;recordFd=rf;actionFd=af;runDir=dir;sequence=index;
   }catch(e){next.close();if(rf!==undefined)closeSync(rf);if(af!==undefined)closeSync(af);if(lf!==undefined)closeSync(lf);throw e;}
   liveControl?.reset();
   return {run:`run-${String(index).padStart(4,'0')}`,status:sim.status()};
  }
  await newRun(scenario,assignments);
  const scheduler=fairScheduler(),inFlight=new Map(),launcherKey=Symbol('launcher');
  const enqueue=fn=>scheduler.enqueue(launcherKey,fn);
  if(liveConfig)liveControl=createLive({options:liveConfig,getSim:()=>sim,getSequence:()=>sequence,enqueue,record:entry=>{const line=JSON.stringify(entry)+'\n';sim.accountAuditBytes(Buffer.byteLength(line));writeSync(liveFd,line);},onError:e=>{if(e.code!=='RUN_BYTE_BUDGET'){broken=true;liveControl.close();}}});
  const dispatch=async(identity,request)=>{
   if(broken)throw new Error('Hub stopped after storage failure');
   try{liveControl?.expire();}catch(e){if(e.code!=='RUN_BYTE_BUDGET'){broken=true;liveControl?.close();}throw e;}
   if(request.method==='tools/list')return {tools:toolList(identity.role,{live:!!liveControl})};
   if(request.method!=='tools/call')throw new Error('Unknown hub method');
   const {name,arguments:args={}}=request.params||{};validateCall(identity,name,args,{live:!!liveControl});
   if(name==='sim.reset')return newRun(sim.header.scenario,sim.header.assignments);
   if(name==='sim.scenario')return newRun(args.scenario,args.assignments);
   try{
    if(liveControl){
     if(name.startsWith('robot.')&&identity.role!=='robot')throw new Error('Live controls require the owned robot caller');
     if(name==='sim.step')throw new Error('Live stepping is owned by the launcher barrier');
     if(name==='sim.assign')throw new Error('Live assignments are fixed until reset');
     if(name==='sim.status')return {...sim.status(),live:liveControl.status()};
     if(name==='robot.submit')return liveControl.submit(identity,args.robotId,args.round);
     if(name.startsWith('robot.'))return liveControl.command(identity,name,args.robotId,args.round,()=>sim.invoke(identity,name,args));
    }
    return sim.invoke(identity,name,args);}catch(e){if(['EIO','ENOSPC','EBADF'].includes(e.code)){broken=true;liveControl?.close();}throw e;}
  };
  server=http.createServer({headersTimeout:2000,requestTimeout:2000,connectionsCheckingInterval:500},(req,res)=>{
   const send=(code,body)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store',...(code!==200?{Connection:'close'}:{})});res.end(JSON.stringify(body));};
   if(closed){send(503,{error:'Hub closing'});return;}
   if(req.headers.origin||req.headers.host!==`127.0.0.1:${server.address().port}`){send(403,{error:'Loopback origin required'});return;}
   const identity=capabilities.get(req.headers.authorization);if(!identity){send(401,{error:'Connection capability required'});return;}
   clearTimeout(req.socket.preAuthTimer);
   if(req.method!=='POST'||req.url!=='/call'){send(404,{error:'Unknown route'});return;}
   if((inFlight.get(identity)||0)>=4){send(429,{error:'Capability request quota exceeded'});return;}
   inFlight.set(identity,(inFlight.get(identity)||0)+1);
   let queued=false,released=false,data='',size=0;
   const release=()=>{if(!released){released=true;inFlight.set(identity,inFlight.get(identity)-1);}};
   res.on('close',()=>{if(!queued)release();});res.on('finish',()=>{if(!queued)release();});req.on('aborted',()=>{if(!queued)release();});
   req.on('data',chunk=>{size+=chunk.length;if(size>262144){send(413,{error:'Request too large'});req.resume();}else data+=chunk;});
   req.on('end',()=>{
    if(released||res.writableEnded||res.destroyed)return;
    let input;try{input=JSON.parse(data);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['method','params'].includes(k)))throw new Error();}catch{send(400,{error:'Invalid request'});return;}
    queued=true;scheduler.enqueue(identity,async()=>{try{if(!res.destroyed)send(200,{result:await dispatch(identity,input)});}catch(e){send(200,{error:e.message});}finally{release();}}).catch(()=>{broken=true;liveControl?.close();});
   });
  });
  // No small pre-auth connection cap: unauthenticated sockets cannot occupy a caller's quota.
  server.on('connection',socket=>{socket.preAuthTimer=setTimeout(()=>socket.destroy(),2000);socket.preAuthTimer.unref();socket.setTimeout(2000,()=>socket.destroy());socket.once('close',()=>clearTimeout(socket.preAuthTimer));});
  server.keepAliveTimeout=1000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const url=`http://127.0.0.1:${server.address().port}`;
  for(const identity of [{role:'coordinator',agentId:'coordinator'},...sim.header.assignments.map(a=>({role:'robot',agentId:a.agentId,robotId:a.robotId}))]){
   const token=randomBytes(32).toString('hex');capabilities.set(`Bearer ${token}`,identity);
   const key=identity.robotId||'coordinator',config={url,token,...identity},path=join(root,`connection-${key}.json`);
   // Root lease serializes creation; do not follow preexisting files.
   writeFileSync(path,JSON.stringify(config)+'\n',{flag:'wx',mode:0o600});connections[key]=path;
  }
  liveControl?.reset();
  const releaseResources=()=>{
   const errors=[];const attempt=fn=>{try{fn();}catch(e){if(e.code!=='ENOENT')errors.push(e);}};
   attempt(()=>sim.close());for(const fd of [recordFd,actionFd,liveFd])if(fd!==undefined)attempt(()=>closeSync(fd));
   for(const path of Object.values(connections))attempt(()=>unlinkSync(path));
   attempt(()=>closeSync(lock));attempt(()=>unlinkSync(lockPath));if(errors.length)throw new AggregateError(errors,'Hub cleanup failed');
  };
  return {url,connections,get runDir(){return runDir;},get sequence(){return sequence;},async close(){
   if(closed)return;closed=true;liveControl?.close();
   try{await scheduler.drain();server.closeAllConnections();await new Promise((r,j)=>server.close(e=>e?j(e):r()));}finally{releaseResources();}
  }};
 }catch(e){liveControl?.close();if(server)server.close();if(sim)sim.close();if(recordFd!==undefined)closeSync(recordFd);if(actionFd!==undefined)closeSync(actionFd);if(liveFd!==undefined)closeSync(liveFd);try{for(const path of Object.values(connections)){try{unlinkSync(path);}catch{}}}finally{closeSync(lock);try{unlinkSync(lockPath);}catch{}}throw e;}
}
