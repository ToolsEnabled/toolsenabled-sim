import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSim,replayActions,verifyTrajectory} from '../src/sim.mjs';
import {startHub,defaultScenario,defaultAssignments} from '../src/hub.mjs';
import {McpClient} from '../tools/mcp-client.mjs';
import {createLive,liveOptions} from '../src/live.mjs';

const who=id=>({role:'robot',agentId:`script-${id}`,robotId:id});
const drive=id=>({robotId:id,v:1.1234567890123457,w:2.1234567890123457,duration:4.123456789012345});
async function exactReplay(trajectory,actions){const copy=await replayActions(verifyTrajectory(trajectory).records[0],actions);try{assert.equal(copy.trajectory(),trajectory);}finally{copy.close();}}

test('R-1: a manual step-1 flood exhausts only its robot share, without mutation or stopping peers',async()=>{
 const scenario=defaultScenario(),sim=await createSim({scenario,assignments:defaultAssignments(scenario),maxRunBytes:1048576,maxTicks:80});
 try{let refused=0;
  for(let tick=0;tick<80;tick++){let denied=false;
   for(let i=0;i<64;i++){try{sim.invoke(who('amber'),'robot.drive',drive('amber'));}catch(e){assert.equal(e.code,'ROBOT_BYTE_BUDGET');assert.match(e.message,/amber.*recording byte share.*refused.*run remains active/i);refused++;denied=true;break;}}
   if(denied){const before=sim.trajectory(),journal=sim.actions(),pose=sim.invoke(who('amber'),'sim.observe',{robotId:'amber'});for(let i=0;i<10;i++)assert.throws(()=>sim.invoke(who('amber'),'robot.drive',drive('amber')),e=>e.code==='ROBOT_BYTE_BUDGET');assert.equal(sim.trajectory(),before);assert.deepEqual(sim.actions(),journal);assert.deepEqual(sim.invoke(who('amber'),'sim.observe',{robotId:'amber'}),pose);}
   for(const id of ['teal','violet'])if(tick%20===0||tick===79)sim.invoke(who(id),'robot.drive',{robotId:id,v:0,w:0,duration:1/60});
   sim.step(1);assert.equal(sim.status().stopReason,null);
  }
  assert.ok(refused);assert.equal(sim.status().tick,80);assert.ok(Buffer.byteLength(sim.trajectory())+Buffer.byteLength(JSON.stringify(sim.actions()))<1048576);await exactReplay(sim.trajectory(),sim.actions());
 }finally{sim.close();}
});

test('R-1: live step-1 floods preserve submissions, peers, reset and the combined file cap',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sim-budget-'));let hub;const clients={};
 try{hub=await startHub({root,maxRunBytes:1048576,maxTicks:20,live:{stepTicks:1,budgetMs:120000}});for(const [id,file] of Object.entries(hub.connections)){clients[id]=new McpClient(file);await clients[id].initialize();}
  for(let cycle=0;cycle<2;cycle++){let refused=0,accepted=0;
   for(let tick=0;tick<20;tick++){let denied=false;
    const round=(await clients.coordinator.call('sim.status',{})).live.round;
    for(let i=0;i<63;i++){try{await clients.amber.call('robot.drive',{...drive('amber'),round});accepted++;}catch(e){assert.match(e.message,/amber.*recording byte share.*refused.*run remains active/i);refused++;denied=true;break;}}
    if(denied){const before=await readFile(join(hub.runDir,'actions.jsonl'));await assert.rejects(clients.amber.call('robot.drive',{...drive('amber'),round}),/recording byte share/);assert.deepEqual(await readFile(join(hub.runDir,'actions.jsonl')),before);}
    await clients.amber.call('robot.submit',{robotId:'amber',round});
    for(const id of ['teal','violet']){await clients[id].call('robot.drive',{robotId:id,v:0,w:0,duration:1/60,round});await clients[id].call('robot.submit',{robotId:id,round});}
    const state=await clients.coordinator.call('sim.status',{});assert.equal(state.tick,tick+1);assert.equal(state.stopReason,null);
   }
   assert.ok(refused);assert.ok(accepted);const files=await Promise.all(['trajectory.jsonl','actions.jsonl','live.jsonl'].map(f=>readFile(join(hub.runDir,f),'utf8')));assert.ok(files.reduce((n,s)=>n+Buffer.byteLength(s),0)<1048576);await exactReplay(files[0],files[1].trim().split('\n').map(JSON.parse));if(cycle===0)await clients.coordinator.call('sim.reset',{});
  }
 }finally{for(const c of Object.values(clients))await c.close();await hub?.close();await rm(root,{recursive:true,force:true});}
});

test('R-2: a planned short goto fits a small recording cap and replays exactly',async()=>{
 const scenario=defaultScenario(),sim=await createSim({scenario,assignments:defaultAssignments(scenario),maxRunBytes:262144,maxTicks:60});
 try{sim.invoke(who('amber'),'robot.goto',{robotId:'amber',x:-4.5,y:-3.5});for(let i=0;i<60;i++)sim.step(1);assert.equal(sim.status().stopReason,null);assert.ok(Math.abs(sim.snapshot().robots[0].x+4.5)<.04);await exactReplay(sim.trajectory(),sim.actions());}finally{sim.close();}
});

test('R-2: replaced or completed motion releases unused reservation; failed planning spends nothing',async()=>{
 const scenario=defaultScenario(),sim=await createSim({scenario,assignments:defaultAssignments(scenario),maxRunBytes:1048576,maxTicks:1200});
 try{const before=sim.actions();for(let i=0;i<100;i++)assert.throws(()=>sim.invoke(who('amber'),'robot.goto',{robotId:'amber',x:-3.8,y:-3.5}),/obstructed/);assert.deepEqual(sim.actions(),before);
  // Each command replaces the same bounded path before physics advances. Only
  // one future path can be recorded; reserving it repeatedly would reject this.
  for(let i=0;i<10;i++)sim.invoke(who('amber'),'robot.goto',{robotId:'amber',x:-4.5,y:-3.5});for(let i=0;i<60;i++)sim.step(1);
  for(let i=0;i<10;i++)sim.invoke(who('amber'),'robot.goto',{robotId:'amber',x:-5,y:-3.5});for(let i=0;i<60;i++)sim.step(1);assert.equal(sim.status().stopReason,null);await exactReplay(sim.trajectory(),sim.actions());
 }finally{sim.close();}
});

test('R-1: an exhausted live robot still receives a journaled deadline hold',async()=>{
 const scenario=defaultScenario(),sim=await createSim({scenario,assignments:defaultAssignments(scenario),maxRunBytes:262144,maxTicks:3,live:true});let live;
 try{let advance,fail;const advanced=new Promise((resolve,reject)=>{advance=resolve;fail=reject;});
  live=createLive({options:liveOptions({stepTicks:1,budgetMs:100,activeRobots:['amber']},scenario),getSim:()=>sim,getSequence:()=>1,enqueue:fn=>Promise.resolve().then(fn),record:entry=>{sim.accountAuditBytes(Buffer.byteLength(JSON.stringify(entry)+'\n'));if(entry.kind==='commit')advance(entry);},onError:fail});live.reset();
  let refused=false;for(let i=0;i<63;i++){try{live.command(who('amber'),'robot.drive','amber','1:0',()=>sim.invoke(who('amber'),'robot.drive',{...drive('amber'),round:'1:0'}));}catch(e){assert.equal(e.code,'ROBOT_BYTE_BUDGET');refused=true;break;}}assert.ok(refused);
  const committed=await advanced;live.close();assert.equal(committed.reason,'deadline');assert.equal(sim.status().tick,1);assert.equal(sim.status().stopReason,null);const hold=sim.actions().find(a=>a.name==='robot.drive'&&a.robotId==='amber'&&a.caller.role==='launcher');assert.equal(hold.args.v,0);assert.equal(hold.args.w,0);await exactReplay(sim.trajectory(),sim.actions());
 }finally{live?.close();sim.close();}
});

test('R-1: the frozen 0.1.0 byte-budget stop keeps its original header and trajectory bytes',async()=>{
 const {hash}=await import('../src/sim.mjs'),fixture=name=>readFile(new URL('./fixtures/'+name,import.meta.url),'utf8');
 const trajectory=await fixture('v2-budget-trajectory.jsonl'),journal=await fixture('v2-budget-actions.jsonl'),receipt=JSON.parse(await fixture('v2-budget.json'));assert.equal(hash(trajectory),receipt.trajectorySha256);assert.equal(hash(journal),receipt.actionsSha256);assert.equal(receipt.sourceCommit,'7cb920358715b6f792d0d62366979b0ef6d7d754');const rows=verifyTrajectory(trajectory);assert.equal(rows.records[0].budgetPolicy,undefined);const sim=await replayActions(rows.records[0],journal.trim().split('\n').map(JSON.parse));try{assert.equal(sim.trajectory(),trajectory);const {deliveryRule,deliveryAreas,...recordedStatus}=sim.status();assert.deepEqual(recordedStatus,receipt.status);}finally{sim.close();}
});
