import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSim,replayActions,verifyTrajectory} from '../src/sim.mjs';
import {startHub,defaultScenario,defaultAssignments} from '../src/hub.mjs';
import {createLive,liveOptions} from '../src/live.mjs';
import {McpClient} from '../tools/mcp-client.mjs';

const who=id=>({role:'robot',agentId:`script-${id}`,robotId:id});
async function replay(bytes,actions){const sim=await replayActions(verifyTrajectory(bytes).records[0],actions);try{assert.equal(sim.trajectory(),bytes);return sim.status();}finally{sim.close();}}

test('F-1: whole-run exhaustion stops a live submission immediately, with one replayable stop and a usable reset',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sim-run-full-')),cap=73728,clients={};let hub;
 try{hub=await startHub({root,maxRunBytes:cap,live:{stepTicks:1,budgetMs:120000}});for(const [id,file] of Object.entries(hub.connections)){clients[id]=new McpClient(file);await clients[id].initialize();}
  let stopped=false;
  for(let tick=0;tick<100&&!stopped;tick++)for(const id of ['amber','teal','violet']){
   try{await clients[id].call('robot.submit',{robotId:id,round:`1:${tick}`});}
   catch(e){assert.match(e.message,/Run stopped at recording byte budget/);const state=await clients.coordinator.call('sim.status',{});assert.equal(state.stopReason,'byte-budget');assert.equal(state.live.stopped,'byte-budget');assert.equal(state.live.budgetMs,120000);stopped=true;break;}
  }
  assert.ok(stopped);const run=hub.runDir,files=await Promise.all(['trajectory','actions','live'].map(name=>readFile(join(run,name+'.jsonl'),'utf8'))),actions=files[1].trim().split('\n').map(JSON.parse);
  assert.ok(files.reduce((n,s)=>n+Buffer.byteLength(s),0)<cap);assert.equal(actions.filter(a=>a.name==='recording.stop').length,1);assert.equal(actions.at(-1).name,'recording.stop');assert.deepEqual(actions.at(-1).caller,{role:'launcher',agentId:'sim-launcher'});assert.equal((await replay(files[0],actions)).stopReason,'byte-budget');
  const state=await clients.coordinator.call('sim.status',{});await assert.rejects(clients.amber.call('robot.submit',{robotId:'amber',round:state.live.round}),/Live run has stopped/);assert.equal(await readFile(join(run,'actions.jsonl'),'utf8'),files[1]);
  await clients.coordinator.call('sim.reset',{});const fresh=await clients.coordinator.call('sim.status',{});assert.equal(fresh.stopReason,null);assert.equal(fresh.live.stopped,null);for(const id of ['amber','teal','violet'])await clients[id].call('robot.submit',{robotId:id,round:fresh.live.round});assert.equal((await clients.coordinator.call('sim.status',{})).tick,1);
 }finally{for(const c of Object.values(clients))await c.close();await hub?.close();await rm(root,{recursive:true,force:true});}
});

test('F-1: a whole-run command refusal is RUN_BYTE_BUDGET and cancels the live deadline',async()=>{
 const scenario=defaultScenario(),cap=131072;let stored=0,queued=0,live;
 const sim=await createSim({scenario,assignments:defaultAssignments(scenario),maxRunBytes:cap,live:true,onRecord:s=>stored+=Buffer.byteLength(s),onAction:s=>stored+=Buffer.byteLength(s)});
 try{live=createLive({options:liveOptions({stepTicks:1,budgetMs:30},scenario),getSim:()=>sim,getSequence:()=>1,enqueue:fn=>{queued++;return Promise.resolve().then(fn);},record:()=>{},onError:e=>{throw e;}});live.reset();sim.accountAuditBytes(cap-stored-40000);
  assert.throws(()=>live.command(who('amber'),'robot.drive','amber','1:0',()=>sim.invoke(who('amber'),'robot.drive',{robotId:'amber',v:0,w:0,duration:1/60,round:'1:0'})),e=>e.code==='RUN_BYTE_BUDGET');assert.equal(live.status().stopped,'byte-budget');assert.equal(sim.actions().length,1);assert.equal(sim.actions()[0].name,'recording.stop');
  await new Promise(r=>setTimeout(r,70));assert.equal(queued,0);assert.equal(sim.status().tick,0);assert.equal((await replay(sim.trajectory(),sim.actions())).stopReason,'byte-budget');
 }finally{live?.close();sim.close();}
});

for(const name of ['robot.submit','robot.grab','robot.release'])test(`F-1: ${name} does not reserve existing motion twice against whole-run space`,async()=>{
 const scenario=defaultScenario();scenario.crates[0].x=-4.25;const cap=1048576;let stored=0;
 const sim=await createSim({scenario,assignments:defaultAssignments(scenario),maxRunBytes:cap,maxTicks:2000,live:true,onRecord:s=>stored+=Buffer.byteLength(s),onAction:s=>stored+=Buffer.byteLength(s)});
 try{const args={robotId:'amber',round:'1:0'};if(name==='robot.release')sim.invoke(who('amber'),'robot.grab',{...args,crateId:'cargo-a'});
  sim.invoke(who('amber'),'robot.goto',{...args,x:-5,y:-2.5});sim.accountAuditBytes(cap-stored-70000);
  assert.equal(sim.invoke(who('amber'),name,{...args,...(name==='robot.grab'?{crateId:'cargo-a'}:{})}).accepted,true);assert.equal(sim.status().stopReason,null);assert.equal(sim.actions().at(-1).name,name);await replay(sim.trajectory(),sim.actions());
 }finally{sim.close();}
});
