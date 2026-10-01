import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSim, validateScenario, verifyTrajectory, replayActions} from '../src/sim.mjs';
const scene = JSON.parse(readFileSync(new URL('../scenarios/warehouse.json', import.meta.url)));
const assignments = scene.robots.map((r, i) => ({robotId:r.id, agentId:`agent-${i}`, crateId:scene.crates[i].id, taskId:`task-${i}`, ledgerId:`T${i+1}`}));
const boss = {role:'coordinator',agentId:'coordinator'};
const agent = i => ({role:'robot',agentId:`agent-${i}`,robotId:scene.robots[i].id});
const setup = extra => createSim({scenario:structuredClone(scene),assignments, ...extra});
test('fixed clock and three independent controls advance in lockstep', async () => {
  const s=await setup();
  for(let i=0;i<3;i++) s.invoke(agent(i),'robot.drive',{robotId:scene.robots[i].id,v:1,w:0,duration:1});
  assert.equal(s.status().tick,0);
  s.invoke(boss,'sim.step',{n:30});
  assert.equal(s.status().time,.5);
  for(const r of s.snapshot().robots) assert.ok(Math.abs(r.x+4.5)<.02);
  const before=s.trajectory(); await new Promise(r=>setTimeout(r,10)); assert.equal(s.trajectory(),before);
  s.close();
});
test('strict bounds, role checks and ownership failures are atomic', async () => {
  const s=await setup(); const initial=s.trajectory();
  const cases=[
    [agent(0),'robot.drive',{robotId:'teal',v:1,w:0,duration:1}],
    [agent(0),'robot.drive',{robotId:'amber',v:Infinity,w:0,duration:1}],
    [agent(0),'robot.drive',{robotId:'amber',v:3,w:0,duration:1}],
    [agent(0),'robot.drive',{robotId:'amber',v:1,w:0,duration:1,agentId:'agent-1'}],
    [agent(0),'robot.goto',{robotId:'amber',x:100,y:0}],
    [agent(0),'sim.step',{n:1}], [agent(0),'sim.reset',{}],
    [agent(0),'sim.scenario',{scenario:scene}],
    [boss,'sim.step',{n:61}], [boss,'sim.step',{n:0}], [boss,'sim.step',{n:1.2}],
    [agent(0),'robot.grab',{robotId:'amber',crateId:'cargo-b'}]
  ];
  for(const [who,name,args] of cases) assert.throws(()=>s.invoke(who,name,args));
  assert.equal(s.trajectory(),initial); assert.equal(s.actions().length,0); s.close();
});
test('same seed/actions produce exact bytes; hash chain and full physics replay reject corruption', async () => {
  const a=await setup(); const b=await setup();
  for(const s of [a,b]) { s.invoke(agent(0),'robot.drive',{robotId:'amber',v:1.2,w:.3,duration:2}); for(let i=0;i<3;i++)s.invoke(boss,'sim.step',{n:60}); }
  assert.equal(a.trajectory(),b.trajectory());
  assert.equal(verifyTrajectory(a.trajectory()).ticks,180);
  const replay=await replayActions(a.header,a.actions()); assert.equal(replay.trajectory(),a.trajectory());
  assert.throws(()=>verifyTrajectory(a.trajectory().replace('"tick":1,','"tick":2,')));
  for(const s of [a,b,replay])s.close();
});
test('tick budget, expired actions, simultaneous contacts and collision score', async () => {
  const s=await setup({maxTicks:60});
  s.invoke(agent(0),'robot.drive',{robotId:'amber',v:1,w:0,duration:.25});
  s.invoke(boss,'sim.step',{n:60}); assert.ok(Math.abs(s.snapshot().robots[0].x+4.75)<.02);
  assert.throws(()=>s.invoke(boss,'sim.step',{n:1})); assert.equal(s.status().tick,60); s.close();
  const t=await setup(); t.invoke(agent(0),'robot.drive',{robotId:'amber',v:2,w:0,duration:2});
  t.invoke(boss,'sim.step',{n:60}); assert.ok(t.status().collisions>0); assert.ok(t.status().score<0); t.close();
});
test('scenario validation rejects overlap, duplicate IDs, missing zones and unbounded input', () => {
  assert.equal(validateScenario(scene).robots.length,3);
  for(const mutate of [s=>s.robots.push(s.robots[0]), s=>s.crates[0].zone='missing',s=>s.arena.width=1e9,s=>s.robots[0].x=NaN,s=>s.obstacles[0].x=s.robots[0].x,s=>s.extra=true,s=>s.robots[0].id='wall-n',s=>s.robots[0].id='coordinator']) {
    const candidate=structuredClone(scene); mutate(candidate);
    // Obstacle overlap requires matching both coordinates.
    if(candidate.obstacles[0].x===candidate.robots[0].x)candidate.obstacles[0].y=candidate.robots[0].y;
    assert.throws(()=>validateScenario(candidate));
  }
});
test('scripted agents navigate, grab, deliver and retain assignment provenance each tick', async () => {
  const s=await setup();
  for(let i=0;i<3;i++) s.invoke(agent(i),'robot.goto',{robotId:scene.robots[i].id,x:-4.5,y:scene.robots[i].y});
  for(let j=0;j<2;j++)s.invoke(boss,'sim.step',{n:60});
  for(let i=0;i<3;i++)s.invoke(agent(i),'robot.grab',{robotId:scene.robots[i].id,crateId:scene.crates[i].id});
  for(let i=0;i<3;i++)s.invoke(agent(i),'robot.goto',{robotId:scene.robots[i].id,x:4.3,y:scene.robots[i].y});
  for(let j=0;j<7;j++)s.invoke(boss,'sim.step',{n:60});
  for(let i=0;i<3;i++)s.invoke(agent(i),'robot.release',{robotId:scene.robots[i].id});
  s.invoke(boss,'sim.step',{n:60});
  assert.equal(s.status().delivered,3); assert.equal(s.status().collisions,0); assert.equal(s.status().score,300);
  for(const row of verifyTrajectory(s.trajectory()).records.slice(1)) for(const r of row.robots){
    const a=assignments.find(a=>a.robotId===r.id); assert.equal(r.agentId,a.agentId); assert.equal(r.taskId,a.taskId); assert.equal(r.ledgerId,a.ledgerId); assert.ok(r.action);
  }
  const o=s.invoke(agent(0),'sim.observe',{robotId:'amber'}); assert.equal(typeof o.map,'string'); assert.ok(Array.isArray(o.nearby)); s.close();
});
test('observations describe nearby obstacles and labeled zones, and four-robot scenes need no code',async()=>{
 const s=await setup();try{const o=s.invoke(agent(1),'sim.observe',{robotId:'teal'});assert.equal(o.zones.length,3);assert.equal(o.zones[0].label,'A / AMBER');assert.ok(o.nearby.some(x=>x.kind==='crate'&&x.zone==='zone-b'));}finally{s.close();}
 const scene4=structuredClone(scene);scene4.arena.depth=16;scene4.robots.push({id:'coral',x:-5,y:6,heading:0,color:'#ff8866'});scene4.crates.push({id:'cargo-d',x:-3.8,y:6,zone:'zone-d'});scene4.zones.push({id:'zone-d',label:'D / CORAL',x:5,y:6,width:2,depth:2,color:'#ff8866'});
 const work=scene4.robots.map((r,i)=>({robotId:r.id,agentId:`agent-${i}`,crateId:scene4.crates[i].id,taskId:`task-${i}`,ledgerId:`T${i+1}`}));const four=await createSim({scenario:scene4,assignments:work});try{four.invoke({role:'robot',robotId:'coral',agentId:'agent-3'},'robot.drive',{robotId:'coral',v:1,w:0,duration:.5});four.step(30);assert.equal(four.snapshot().robots.length,4);assert.ok(Math.abs(four.snapshot().robots.find(r=>r.id==='coral').x+4.5)<.02);}finally{four.close();}
});
