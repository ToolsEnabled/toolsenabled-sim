import test from 'node:test';
import assert from 'node:assert/strict';
import {createSim,replayActions} from '../src/sim.mjs';
import {defaultScenario,defaultAssignments} from '../src/hub.mjs';
import {createLive,liveOptions} from '../src/live.mjs';

const who=id=>({role:'robot',agentId:`script-${id}`,robotId:id});
for(const mode of ['manual','live'])for(const name of ['robot.drive','robot.goto'])test(`F1-L1: ${mode} ${name} motion-only refusal preserves peers and advancement`,async()=>{
 const scenario=defaultScenario(),cap=1048576;let stored=0,live;
 const sim=await createSim({scenario,assignments:defaultAssignments(scenario),maxRunBytes:cap,maxTicks:2000,live:mode==='live',onRecord:s=>stored+=Buffer.byteLength(s),onAction:s=>stored+=Buffer.byteLength(s)});
 try{
  if(mode==='live'){live=createLive({options:liveOptions({stepTicks:1,budgetMs:120000},scenario),getSim:()=>sim,getSequence:()=>1,enqueue:fn=>Promise.resolve().then(fn),record:()=>{},onError:e=>{throw e;}});live.reset();}
  sim.accountAuditBytes(cap-stored-60000);
  const args={robotId:'amber',...(name==='robot.drive'?{v:1.1234567890123457,w:0,duration:5}:{x:-5,y:-2.5}),...(live?{round:'1:0'}:{})};
  const before=sim.trajectory(),journal=sim.actions(),pose=sim.invoke(who('amber'),'sim.observe',{robotId:'amber'});
  const invoke=()=>sim.invoke(who('amber'),name,args);
  for(let i=0;i<10;i++)assert.throws(()=>live?live.command(who('amber'),name,'amber','1:0',invoke):invoke(),e=>e.code==='MOTION_BYTE_BUDGET'&&/motion.*refused.*run remains active/i.test(e.message));
  assert.equal(sim.status().stopReason,null);assert.equal(sim.trajectory(),before);assert.deepEqual(sim.actions(),journal);assert.deepEqual(sim.invoke(who('amber'),'sim.observe',{robotId:'amber'}),pose);
  const peer=()=>sim.invoke(who('teal'),'robot.drive',{robotId:'teal',v:0,w:0,duration:1/60,...(live?{round:'1:0'}:{})});
  if(live){live.command(who('teal'),'robot.drive','teal','1:0',peer);for(const id of ['amber','teal','violet'])live.submit(who(id),id,'1:0');assert.equal(live.status().round,'1:1');assert.equal(live.status().stopped,null);}
  else {peer();sim.step(1);}
  assert.equal(sim.status().tick,1);assert.equal(sim.status().stopReason,null);assert.equal(sim.actions().filter(a=>a.name==='recording.stop').length,0);
  const replay=await replayActions(sim.header,sim.actions());try{assert.equal(replay.trajectory(),sim.trajectory());}finally{replay.close();}
 }finally{live?.close();sim.close();}
});
