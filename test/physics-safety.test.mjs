import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createSim,hash} from '../src/sim.mjs';import {defaultScenario,defaultAssignments} from '../src/hub.mjs';
test('artifact hashes are SHA-256 of raw PNG bytes',()=>{const bytes=Buffer.from([137,80,78,71]);assert.equal(hash(bytes),createHash('sha256').update(bytes).digest('hex'));});
test('held crate has physical contacts and cannot tunnel through an obstacle',async()=>{
 const scene=defaultScenario();scene.obstacles.push({id:'stop',x:-1,y:-3.5,width:.4,depth:1.5});const assignments=defaultAssignments(scene);
 const s=await createSim({scenario:scene,assignments});const who={role:'robot',agentId:'script-amber',robotId:'amber'},boss={role:'coordinator',agentId:'coordinator'};
 try{
  s.invoke(who,'robot.goto',{robotId:'amber',x:-4.5,y:-3.5});s.invoke(boss,'sim.step',{n:60});s.invoke(who,'robot.grab',{robotId:'amber',crateId:'cargo-a'});s.invoke(who,'robot.drive',{robotId:'amber',v:2,w:0,duration:4});
  for(let i=0;i<4;i++)s.invoke(boss,'sim.step',{n:60});const state=s.snapshot();assert.ok(state.crates[0].x<=-1.4,JSON.stringify(state.crates[0]));assert.ok(s.status().collisions>0);
 }finally{s.close();}
});
test('tick event records include grab/release and command queue is bounded atomically',async()=>{
 const scene=defaultScenario(),s=await createSim({scenario:scene,assignments:defaultAssignments(scene)}),who={role:'robot',agentId:'script-amber',robotId:'amber'},boss={role:'coordinator',agentId:'coordinator'};
 try{
  s.invoke(who,'robot.goto',{robotId:'amber',x:-4.5,y:-3.5});s.invoke(boss,'sim.step',{n:60});s.invoke(who,'robot.grab',{robotId:'amber',crateId:'cargo-a'});s.invoke(boss,'sim.step',{n:1});
  assert.ok(s.snapshot().events.some(e=>e.name==='robot.grab'));
  s.invoke(who,'robot.release',{robotId:'amber'});s.step(1);assert.ok(s.snapshot().events.some(e=>e.name==='robot.release'));
  for(let i=0;i<64;i++)s.invoke(who,'robot.drive',{robotId:'amber',v:0,w:0,duration:1});
  const before=s.actions();assert.throws(()=>s.invoke(who,'robot.drive',{robotId:'amber',v:1,w:0,duration:1}),/budget/);assert.deepEqual(s.actions(),before);
 }finally{s.close();}
});
test('loaded robot can turn and follow a new direction without breaking the rigid grasp',async()=>{
 const scene=defaultScenario(),s=await createSim({scenario:scene,assignments:defaultAssignments(scene)}),who={role:'robot',agentId:'script-amber',robotId:'amber'},boss={role:'coordinator',agentId:'coordinator'};
 try{s.invoke(who,'robot.goto',{robotId:'amber',x:-4.5,y:-3.5});s.invoke(boss,'sim.step',{n:60});s.invoke(who,'robot.grab',{robotId:'amber',crateId:'cargo-a'});s.invoke(who,'robot.goto',{robotId:'amber',x:-3.5,y:-4.5});for(let i=0;i<6;i++)s.invoke(boss,'sim.step',{n:60});const r=s.snapshot().robots[0],c=s.snapshot().crates[0];assert.ok(Math.hypot(r.x+3.5,r.y+4.5)<.1,JSON.stringify(r));assert.ok(Math.abs(Math.hypot(c.x-r.x,c.y-r.y)-.75)<.06);assert.equal(s.status().collisions,0);}finally{s.close();}
});
test('coordinator can assign the next crate while preserving stable agent ownership',async()=>{
 const scene=defaultScenario();scene.crates.push({id:'cargo-d',x:-6,y:-3.5,zone:'zone-a'});const s=await createSim({scenario:scene,assignments:defaultAssignments(scene)}),boss={role:'coordinator',agentId:'coordinator'},who={role:'robot',agentId:'script-amber',robotId:'amber'};
 try{
  const args={robotId:'amber',crateId:'cargo-d',taskId:'task-d',ledgerId:'T4'};assert.throws(()=>s.invoke(who,'sim.assign',args));
  s.invoke(boss,'sim.assign',args);assert.equal(s.invoke(boss,'sim.assignments',{}).find(a=>a.robotId==='amber').crateId,'cargo-d');s.step(1);const r=s.snapshot().robots[0];assert.equal(r.taskId,'task-d');assert.equal(r.agentId,'script-amber');
  const {replayActions}=await import('../src/sim.mjs');const replay=await replayActions(s.header,s.actions());assert.equal(replay.trajectory(),s.trajectory());replay.close();
 }finally{s.close();}
});
test('grabbing an already touching crate clears the disabled parent contact',async()=>{
 const scene=defaultScenario(),s=await createSim({scenario:scene,assignments:defaultAssignments(scene)}),who={role:'robot',agentId:'script-amber',robotId:'amber'};
 try{s.invoke(who,'robot.drive',{robotId:'amber',v:1,w:0,duration:1});s.step(60);assert.ok(s.snapshot().contacts.includes('amber:cargo-a'));s.invoke(who,'robot.grab',{robotId:'amber',crateId:'cargo-a'});s.step(1);assert.ok(!s.snapshot().contacts.includes('amber:cargo-a'));}finally{s.close();}
});
