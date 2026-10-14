import test from 'node:test';
import assert from 'node:assert/strict';
import {createSim,replayActions} from '../src/sim.mjs';
import {defaultScenario,defaultAssignments} from '../src/hub.mjs';
import {toolList} from '../src/schema.mjs';

const who={role:'robot',agentId:'script-amber',robotId:'amber'};
test('delivery rule and crate-center areas are exposed to agents without changing recorded snapshots',async()=>{
 const scenario=defaultScenario(),sim=await createSim({scenario,assignments:defaultAssignments(scenario)});
 try{
  const before=sim.trajectory(),status=sim.invoke(who,'sim.status',{}),observe=sim.invoke(who,'sim.observe',{robotId:'amber'});
  assert.equal(observe.crateId,'cargo-a');assert.equal(observe.zoneId,'zone-a');
  assert.equal(Object.hasOwn(sim.snapshot().robots[0],'crateId'),false);
  for(const response of [status,observe]){
   assert.match(response.deliveryRule,/released.*fully inside/i);assert.match(response.deliveryRule,/width\/2 - 0\.3/);assert.match(response.deliveryRule,/depth\/2 - 0\.3/);
   // fresh-user-6 Sim #1: the rule and the areas name the robot's stop point, since robot.goto moves the robot and the crate rides 0.75 m ahead.
   assert.match(response.deliveryRule,/robot\.goto moves the robot.*0\.75 m ahead/);assert.match(response.deliveryRule,/robotStops/);
   assert.deepEqual(response.deliveryAreas[0],{zoneId:'zone-a',crateSize:.6,center:{x:5,y:-3.5},centerBounds:{minX:4.300001,maxX:5.699999,minY:-4.199999,maxY:-2.800001},carryOffset:.75,robotStops:{east:{x:4.25,y:-3.5},west:{x:5.75,y:-3.5},south:{x:5,y:-4.25},north:{x:5,y:-2.75}}});
  }
  assert.deepEqual(observe.deliveryAreas,status.deliveryAreas);status.deliveryAreas[0].center.x=999;assert.equal(sim.status().deliveryAreas[0].center.x,5);
  assert.equal(sim.trajectory(),before);assert.equal(Object.hasOwn(sim.snapshot().status,'deliveryRule'),false);
  sim.step(1);const replay=await replayActions(sim.header,sim.actions());try{assert.equal(replay.trajectory(),sim.trajectory());}finally{replay.close();}
 }finally{sim.close();}
});
// fresh-user-6 Sim #1: a coordinator who followed "Aim for the zone center" sent robot.goto to zone A's center (5, -3.5); the held crate
// was released at x=5.72492, outside maxX 5.699999, and nothing was delivered. The advertised robot stop point must deliver.
test('the advertised robot stop point delivers cargo-a to zone A; the zone center itself does not',async()=>{
 async function carry(target){
  const scenario=defaultScenario(),sim=await createSim({scenario,assignments:defaultAssignments(scenario)});
  try{
   sim.invoke(who,'robot.goto',{robotId:'amber',x:-4.5,y:-3.5});for(let i=0;i<2;i++)sim.step(60);
   sim.invoke(who,'robot.grab',{robotId:'amber',crateId:'cargo-a'});
   sim.invoke(who,'robot.goto',{robotId:'amber',x:target.x,y:target.y});for(let i=0;i<7;i++)sim.step(60);
   sim.invoke(who,'robot.release',{robotId:'amber'});const status=sim.step(60);
   const crate=sim.snapshot().crates.find(c=>c.id==='cargo-a'),robot=sim.snapshot().robots.find(r=>r.id==='amber');
   return {delivered:status.delivered,score:status.score,collisions:status.collisions,crateX:crate.x,robotX:robot.x};
  }finally{sim.close();}
 }
 const area=(await (async()=>{const s=defaultScenario(),sim=await createSim({scenario:s,assignments:defaultAssignments(s)});try{return sim.status().deliveryAreas.find(a=>a.zoneId==='zone-a');}finally{sim.close();}})());
 const stop=await carry(area.robotStops.east);
 assert.equal(stop.delivered,1,JSON.stringify(stop));assert.equal(stop.score,100);assert.equal(stop.collisions,0);
 assert.ok(stop.crateX>=area.centerBounds.minX&&stop.crateX<=area.centerBounds.maxX,JSON.stringify(stop));assert.ok(Math.abs(stop.crateX-area.center.x)<.1,JSON.stringify(stop));
 const center=await carry(area.center);
 assert.equal(center.delivered,0,JSON.stringify(center));assert.ok(center.crateX>area.centerBounds.maxX,JSON.stringify(center));
});
test('tool descriptions teach the complete delivery rule in manual and live catalogs',()=>{
 // fresh-user-7 Sim #6: robot.goto, the call where a crate was carried past its zone, now says where the robot stops.
 for(const live of [false,true]){const goto=toolList('robot',{live}).find(t=>t.name==='robot.goto');assert.match(goto.description,/The robot stops at the coordinate; a held crate rides 0\.75 m ahead of it, so to deliver, send the robot to deliveryAreas\[\]\.robotStops, not to the zone center\./);}
 for(const live of [false,true])for(const name of ['sim.observe','sim.status','robot.release']){
  const tool=toolList('robot',{live}).find(t=>t.name===name);assert.match(tool.description,/released.*fully inside/i);assert.match(tool.description,/width\/2 - 0\.3/);assert.match(tool.description,/depth\/2 - 0\.3/);assert.match(tool.description,/0\.75 m ahead/);
 }
});
test('advertised margin matches delivery scoring: near edge inside, 2 cm outside, and held crate',async()=>{
 for(const [x,expected] of [[4.31,1],[4.28,0],[5,1]]){
  const scenario=defaultScenario();scenario.crates[0].x=x;
  const sim=await createSim({scenario,assignments:defaultAssignments(scenario)});try{assert.equal(sim.status().delivered,expected);assert.ok(sim.status().deliveryAreas[0]);}finally{sim.close();}
 }
 const scenario=defaultScenario();scenario.robots[0].x=4.25;scenario.crates[0].x=5;
 const sim=await createSim({scenario,assignments:defaultAssignments(scenario)});
 try{assert.equal(sim.status().delivered,1);sim.invoke(who,'robot.grab',{robotId:'amber',crateId:'cargo-a'});assert.equal(sim.status().delivered,0);sim.invoke(who,'robot.release',{robotId:'amber'});assert.equal(sim.status().delivered,1);}finally{sim.close();}
});
test('every advertised centerBounds edge passes the actual scorer at an exact waypoint',async()=>{
 const base=defaultScenario(),initial=await createSim({scenario:base,assignments:defaultAssignments(base)});
 const areas=initial.status().deliveryAreas;initial.close();
 for(const area of areas)for(const [key,axis] of [['minX','x'],['maxX','x'],['minY','y'],['maxY','y']]){
  const scenario=defaultScenario(),crate=scenario.crates.find(c=>c.zone===area.zoneId);
  Object.assign(crate,area.center,{[axis]:area.centerBounds[key]});
  const sim=await createSim({scenario,assignments:defaultAssignments(scenario)});
  try{assert.equal(sim.snapshot().crates.find(c=>c.id===crate.id).delivered,true,`${area.zoneId}.${key}=${crate[axis]}`);}finally{sim.close();}
 }
});
