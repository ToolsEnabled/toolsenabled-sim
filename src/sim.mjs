import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js';
import {createHash} from 'node:crypto';
import {validate,scenarioSchema,assignmentSchema,validateCall,schemasForVersion} from './schema.mjs';
import {planPath} from './path.mjs';
import {compareIds} from './order.mjs';
import {deliveryRule,deliveryAreas} from './delivery.mjs';
export const DT=1/60;
const q=n=>Math.round(n*1e6)/1e6;
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
export const canonical=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:canonical(value)).digest('hex');
let initialized;
export function validateScenario(input,{formatVersion=2}={}){
 validate(schemasForVersion(formatVersion).scenario,input); const s=structuredClone(input); const ids=new Set(['coordinator','wall-n','wall-s','wall-e','wall-w']);
 for(const item of [...s.robots,...s.crates,...s.zones,...s.obstacles]){
  if(ids.has(item.id))throw new Error('Duplicate scene ID');ids.add(item.id);
  const rx=item.width?item.width/2:.35,ry=item.depth?item.depth/2:.35;
  if(Math.abs(item.x)+rx>=s.arena.width/2||Math.abs(item.y)+ry>=s.arena.depth/2)throw new Error('Object outside arena');
 }
 for(const c of s.crates)if(!s.zones.some(z=>z.id===c.zone))throw new Error('Missing destination zone');
 const solid=[...s.robots.map(r=>({...r,width:.66,depth:.66})),...s.crates.map(c=>({...c,width:.6,depth:.6})),...s.obstacles];
 for(let i=0;i<solid.length;i++)for(let j=i+1;j<solid.length;j++)if(Math.abs(solid[i].x-solid[j].x)<(solid[i].width+solid[j].width)/2&&Math.abs(solid[i].y-solid[j].y)<(solid[i].depth+solid[j].depth)/2)throw new Error('Overlapping solid objects');
 return s;
}
export function validateAssignments(input,scenario,{formatVersion=2}={}){
 validate(schemasForVersion(formatVersion).assignments,input);const a=structuredClone(input).sort((a,b)=>compareIds(a.robotId,b.robotId));
 for(const key of ['robotId','agentId','crateId'])if(new Set(a.map(x=>x[key])).size!==a.length)throw new Error(`Duplicate assignment ${key}`);
 if(a.length!==scenario.robots.length)throw new Error('One assignment required per robot');
 for(const x of a)if(!scenario.robots.some(r=>r.id===x.robotId)||!scenario.crates.some(c=>c.id===x.crateId))throw new Error('Assignment references unknown object');
 return a;
}
export async function createSim({scenario,seed=scenario.seed,assignments,maxTicks=36000,formatVersion=2,maxRunBytes=128*1024*1024,budgetPolicy='robot-shares-v1',retainLog=true,live=false,onRecord=()=>{},onAction=()=>{}}){
 if(maxRunBytes!==null&&(!Number.isSafeInteger(maxRunBytes)||maxRunBytes<65536||maxRunBytes>128*1024*1024))throw new Error('Invalid recording byte budget');
 if(!['legacy','robot-shares-v1'].includes(budgetPolicy))throw new Error('Unsupported recording budget policy');
 if(formatVersion===1)maxRunBytes=null;
 const scene=validateScenario(scenario,{formatVersion});scene.seed=seed;validate(schemasForVersion(formatVersion).scenario,scene);
 const work=validateAssignments(assignments,scene,{formatVersion});
 if(!Number.isSafeInteger(maxTicks)||maxTicks<1||maxTicks>36000)throw new Error('Invalid tick budget');
 initialized??=RAPIER.init(); await initialized;
 const world=new RAPIER.World({x:0,y:0,z:0});world.timestep=DT;
 const queue=new RAPIER.EventQueue(true), names=new Map(), robots=new Map(),crates=new Map();
 let tick=0,collisions=0,previous='0'.repeat(64),closed=false,stopReason=null,recordBytes=0,actionBytes=0,auditBytes=0,actionOrder=0,pendingBytes=0;const lines=[],actions=[],touching=new Set();
 let pendingEvents=[],tickEvents=[];const commandsAtTick=new Map(),robotBytes=new Map(),submittedAtTick=new Set(),chargedMotion=new Set();
 const sharedRobots=maxRunBytes!==null&&budgetPolicy==='robot-shares-v1';
 const robotByteLimit=maxRunBytes===null?Infinity:Math.floor(maxRunBytes/(2*scene.robots.length));
 function body(item,kind){
  const moving=kind!=='obstacle';const desc=moving?RAPIER.RigidBodyDesc.dynamic():RAPIER.RigidBodyDesc.fixed();
  desc.setTranslation(item.x,.3,item.y);
  if(moving)desc.enabledTranslations(true,false,true).lockRotations().setCanSleep(false).setLinearDamping(0);
  const b=world.createRigidBody(desc);
  const shape=kind==='robot'?RAPIER.ColliderDesc.cylinder(.3,.33):RAPIER.ColliderDesc.cuboid((item.width||.6)/2,.3,(item.depth||.6)/2);
  shape.setFriction(0).setRestitution(0).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);if(moving)shape.setMass(kind==='robot'?50:1);
  const col=world.createCollider(shape,b);names.set(col.handle,item.id);return {body:b,collider:col};
 }
 for(const r of [...scene.robots].sort((a,b)=>compareIds(a.id,b.id)))robots.set(r.id,{...r,...body(r,'robot'),action:{type:'idle'},holding:null,assignment:work.find(a=>a.robotId===r.id),lastAction:{type:'idle'}});
 for(const c of [...scene.crates].sort((a,b)=>compareIds(a.id,b.id)))crates.set(c.id,{...c,...body(c,'crate'),heldBy:null});
 for(const o of scene.obstacles)body(o,'obstacle');
 for(const o of [{id:'wall-n',x:0,y:-scene.arena.depth/2,width:scene.arena.width+.2,depth:.2},{id:'wall-s',x:0,y:scene.arena.depth/2,width:scene.arena.width+.2,depth:.2},{id:'wall-w',x:-scene.arena.width/2,y:0,width:.2,depth:scene.arena.depth},{id:'wall-e',x:scene.arena.width/2,y:0,width:.2,depth:scene.arena.depth}])body(o,'obstacle');
 const header={kind:'header',version:formatVersion,engine:'rapier3d-compat@0.17.3',dt:DT,seed,scenario:scene,assignments:structuredClone(work),maxTicks,...(maxRunBytes!==null?{maxRunBytes}:{}),...(sharedRobots?{budgetPolicy}:{})};
 function emit(data){const row={...data,previous};row.hash=hash(row);const line=canonical(row)+'\n';const size=Buffer.byteLength(line);if(maxRunBytes!==null&&recordBytes+actionBytes+auditBytes+size>maxRunBytes)throw new Error('Recording reservation invariant failed');onRecord(line);recordBytes+=size;if(retainLog)lines.push(line);previous=row.hash;}
 function position(r){const p=r.body.translation();return {x:q(p.x),y:q(p.z)};}
 function delivered(c){const p=position(c),z=scene.zones.find(z=>z.id===c.zone);return !c.heldBy&&Math.abs(p.x-z.x)<=z.width/2-.3&&Math.abs(p.y-z.y)<=z.depth/2-.3;}
 function recordedStatus(){const done=[...crates.values()].filter(delivered).length;return {tick,time:q(tick*DT),delivered:done,total:crates.size,collisions,score:done*100-collisions*10,complete:done===crates.size,remainingTicks:maxTicks-tick,...(maxRunBytes!==null?{stopReason}:{})};}
 function guidance(){return {deliveryRule,deliveryAreas:deliveryAreas(scene.zones)};}
 function status(){return {...recordedStatus(),...guidance()};}
 function snapshot(){return {kind:'tick',tick,time:q(tick*DT),events:structuredClone(tickEvents),robots:[...robots.values()].map(r=>({id:r.id,...position(r),heading:q(r.heading),holding:r.holding,agentId:r.assignment.agentId,taskId:r.assignment.taskId,ledgerId:r.assignment.ledgerId,...(formatVersion>=2?{caller:r.caller||null}:{}),action:structuredClone(r.lastAction)})),crates:[...crates.values()].map(c=>({id:c.id,...position(c),zone:c.zone,heldBy:c.heldBy,delivered:delivered(c)})),contacts:[...touching].sort(),status:recordedStatus()};}
 function ensure(){if(closed)throw new Error('Simulation closed');}
 function actionEntry(who,name,args){return {order:actionOrder,tick,identity:structuredClone(who),...(formatVersion>=2?{caller:{role:who.role,agentId:who.agentId},robotId:args.robotId||null,robotIds:args.robotId?[args.robotId]:[...robots.keys()]}:{}),name,args:structuredClone(args)};}
 function appendAction(who,name,args){const entry=actionEntry(who,name,args),line=canonical(entry)+'\n';onAction(line);actionBytes+=Buffer.byteLength(line);actionOrder++;if(retainLog)actions.push(entry);pendingEvents.push(entry);pendingBytes+=Buffer.byteLength(canonical(entry))+1;}
 function stop(){if(!stopReason){stopReason='byte-budget';appendAction({role:'launcher',agentId:'sim-launcher'},'recording.stop',{reason:stopReason});}return status();}
 function budgetError(){const error=new Error('Run stopped at recording byte budget');error.code='RUN_BYTE_BUDGET';return error;}
 function robotBudgetError(id){const error=new Error(`Robot ${id} recording byte share exhausted; call refused; run remains active. Other robots may continue; submit this live round or ask the coordinator to reset.`);error.code='ROBOT_BYTE_BUDGET';return error;}
 const motionBytes=action=>action?.type==='drive'||action?.type==='goto'?Buffer.byteLength(canonical(action)):0;
 const motionReserve=action=>motionBytes(action)*Math.min(action?.remaining||0,maxTicks-tick);
 function gotoAction(r,args){
  const p=position(r),blockers=[...scene.obstacles,...[...crates.values()].filter(c=>!c.heldBy).map(c=>({...position(c),width:.6,depth:.6})),...[...robots.values()].filter(o=>o.id!==r.id).map(o=>({...position(o),width:.66,depth:.66}))];
  const path=planPath(p,{x:args.x,y:args.y},scene,blockers,r.holding?1.1:.36,{bounded:formatVersion>=2});
  return {type:'goto',target:{x:args.x,y:args.y},path,remaining:1200};
 }
 function reserve(who,name,args,nextAction){
  if(stopReason)throw budgetError();if(maxRunBytes===null)return ()=>{};
  // Paths only shrink while stepping; contacts and numeric-width growth have bounded reserves.
  const stateBound=Buffer.byteLength(canonical(snapshot()))+Buffer.byteLength(canonical([...robots.values()].map(r=>r.action)))+names.size*names.size*105+16384;
  const n=name==='sim.step'?args.n:1,entryBytes=Buffer.byteLength(canonical(actionEntry(who,name,args)));
  // Half the cap is divided equally among robots; the rest remains available for
  // world frames and launcher control. The first submission each tick is control
  // traffic, so an exhausted robot can still participate in the live barrier.
  const charged=sharedRobots&&args.robotId&&who.role!=='launcher'&&!(name==='robot.submit'&&!submittedAtTick.has(args.robotId));
  const charge=2*(entryBytes+1)+1024;
  // Reserve only this robot's next motion, not the one being replaced. Path
  // points and remaining ticks only shrink. Actual frame bytes are debited in
  // step(); completion/replacement releases the unused future reservation.
  if(charged&&(robotBytes.get(args.robotId)||0)+charge+motionReserve(nextAction)>robotByteLimit)throw robotBudgetError(args.robotId);
  // Ongoing motion is charged per robot and as actual run frames, not held
  // aside run-wide. Only a new drive/goto adds future motion to this admission
  // check; submit/release add none, and grab already plans an idle action.
  const motion=sharedRobots?(['robot.drive','robot.goto'].includes(name)?motionReserve(nextAction):0):name==='robot.goto'?512000:0;
  const needed=entryBytes*2+pendingBytes+n*stateBound+16384;
  const used=recordBytes+actionBytes+auditBytes;
  if(used+needed+motion>maxRunBytes){
   if(sharedRobots&&who.role!=='launcher'&&motion>0&&used+needed<=maxRunBytes){
    const error=new Error('Requested motion exceeds remaining recording space; call refused; run remains active. Try a shorter drive or ask the coordinator to reset.');error.code='MOTION_BYTE_BUDGET';throw error;
   }
   stop();throw budgetError();
  }
  return ()=>{if(charged)robotBytes.set(args.robotId,(robotBytes.get(args.robotId)||0)+charge);if(sharedRobots&&args.robotId&&name!=='robot.submit'){if(charged)chargedMotion.add(args.robotId);else chargedMotion.delete(args.robotId);}if(name==='robot.submit')submittedAtTick.add(args.robotId);};
 }
 function accountAuditBytes(n){if(maxRunBytes!==null&&recordBytes+actionBytes+auditBytes+n+4096>maxRunBytes){stop();throw budgetError();}auditBytes+=n;}
 function step(n){
  ensure();if(!Number.isSafeInteger(n)||n<1||n>60||tick+n>maxTicks)throw new Error('Lockstep tick budget exceeded');
  for(let i=0;i<n;i++){
   tickEvents=pendingEvents;pendingEvents=[];pendingBytes=0;commandsAtTick.clear();submittedAtTick.clear();
   for(const r of robots.values()){
    let v=0,w=0;const p=position(r);let a=r.action;
    if(a.type==='drive'&&a.remaining>0){v=a.v;w=a.w;a.remaining--;}
    else if(a.type==='goto'&&a.remaining>0){
     a.remaining--;while(a.path.length&&Math.hypot(a.path[0].x-p.x,a.path[0].y-p.y)<.035)a.path.shift();
     if(a.path.length){const t=a.path[0],d=Math.hypot(t.x-p.x,t.y-p.y),error=angle(Math.atan2(t.y-p.y,t.x-p.x)-r.heading);w=Math.max(-2.5,Math.min(2.5,error/DT));if(Math.abs(error)<.2)v=Math.min(1.5,d/DT);}
    }
    r.lastAction=structuredClone(a);
    if((a.type==='drive'&&a.remaining===0)||(a.type==='goto'&&(a.path.length===0||a.remaining===0)))r.action={type:'idle'};
    r.heading=angle(r.heading+w*DT);r.body.setRotation({x:0,y:-Math.sin(r.heading/2),z:0,w:Math.cos(r.heading/2)},true);
    r.body.setLinvel({x:Math.cos(r.heading)*v,y:0,z:Math.sin(r.heading)*v},true);
   }
   world.step(queue);
   queue.drainCollisionEvents((a,b,started)=>{const ids=[names.get(a),names.get(b)].sort(),key=ids.join(':');const own=ids.some(id=>robots.get(id)?.holding===ids.find(x=>x!==id));if(own){touching.delete(key);return;}
    if(started){touching.add(key);if(ids.some(id=>robots.has(id)||crates.has(id)))collisions++;}else touching.delete(key);
   });
   tick++;
   for(const r of robots.values())if(chargedMotion.has(r.id)){robotBytes.set(r.id,(robotBytes.get(r.id)||0)+motionBytes(r.lastAction));if(r.action.type==='idle')chargedMotion.delete(r.id);}
   emit(snapshot());
  }
  return status();
 }
 function invoke(who,name,args={}){
  ensure();validateCall(who,name,args,{live,formatVersion});
  const r=args.robotId?robots.get(args.robotId):null;if(args.robotId&&!r)throw new Error('Unknown robot');
  if(r&&who.role==='robot'&&r.assignment.agentId!==who.agentId)throw new Error('Agent ownership violation');
  if(name==='sim.status')return status();
  if(name==='sim.assignments')return structuredClone(work);
  if(name==='sim.observe'){
   const p=position(r);const objects=[...[...robots.values()].map(x=>({id:x.id,kind:'robot',...position(x)})),...[...crates.values()].map(x=>({id:x.id,kind:'crate',zone:x.zone,heldBy:x.heldBy,...position(x)})),...scene.obstacles.map(x=>({...x,kind:'obstacle'})),...scene.zones.map(x=>({...x,kind:'zone'}))];const nearby=objects.filter(x=>x.id!==r.id&&Math.hypot(x.x-p.x,x.y-p.y)<=4);
   const grid=Array.from({length:13},()=>Array(33).fill('.'));
   for(const [items,char] of [[scene.zones,'Z'],[scene.obstacles,'#'],[[...crates.values()].map(c=>({...c,...position(c)})),'C'],[[...robots.values()].map(b=>({...b,...position(b)})),'R']])for(const o of items){const x=Math.round((o.x/scene.arena.width+.5)*32),y=Math.round((o.y/scene.arena.depth+.5)*12);if(grid[y]?.[x])grid[y][x]=o.id===r.id?'@':char;}
   return {pose:snapshot().robots.find(x=>x.id===r.id),crateId:r.assignment.crateId,zoneId:crates.get(r.assignment.crateId).zone,nearby,zones:structuredClone(scene.zones),...guidance(),contacts:[...touching].filter(k=>k.split(':').includes(r.id)).sort(),map:grid.map(row=>row.join('')).join('\n'),legend:'@ you / R robot / C crate / Z zone / # rack',tick};
  }
  if(name==='sim.reset'||name==='sim.scenario')throw new Error('Run transitions require the hub');
  if(r&&(commandsAtTick.get(r.id)||0)>=64)throw new Error('Per-robot command budget exceeded');
  let nextAction=r?.action;
  if(sharedRobots){
   if(name==='robot.goto')nextAction=gotoAction(r,args);
   if(name==='robot.drive')nextAction={type:'drive',v:args.v,w:args.w,remaining:Math.ceil(args.duration/DT)};
   if(name==='robot.grab'||name==='sim.assign')nextAction={type:'idle'};
  }
  const spend=reserve(who,name,args,nextAction);
  if(name==='sim.step'){if(tick+args.n>maxTicks)throw new Error('Lockstep tick budget exceeded');appendAction(who,name,args);return step(args.n);}
  if(name==='robot.submit'){spend();commandsAtTick.set(r.id,(commandsAtTick.get(r.id)||0)+1);appendAction(who,name,args);return {accepted:true,tick,robotId:r.id};}
  if(name==='sim.assign'){
   const c=crates.get(args.crateId);if(!c||c.heldBy||r.holding||work.some(a=>a.robotId!==r.id&&a.crateId===c.id))throw new Error('Crate cannot be assigned');
   const assignment={...r.assignment,robotId:r.id,agentId:r.assignment.agentId,crateId:c.id,taskId:args.taskId,ledgerId:args.ledgerId};
   work[work.findIndex(a=>a.robotId===r.id)]=assignment;r.assignment=assignment;r.action={type:'idle'};
  }
  if(name==='robot.drive'){r.action={type:'drive',v:args.v,w:args.w,remaining:Math.ceil(args.duration/DT)};}
  if(name==='robot.goto'){
   r.action=sharedRobots?nextAction:gotoAction(r,args);
  }
  if(name==='robot.grab'){
   const c=crates.get(args.crateId);if(!c||r.assignment.crateId!==args.crateId||r.holding||c.heldBy||Math.hypot(position(r).x-position(c).x,position(r).y-position(c).y)>.85)throw new Error('Crate unavailable or out of reach');
   const cp=position(c),p=position(r);if(Math.abs(angle(Math.atan2(cp.y-p.y,cp.x-p.x)-r.heading))>.4)throw new Error('Crate must be in front');
   r.holding=c.id;c.heldBy=r.id;r.action={type:'idle'};
   c.body.setTranslation({x:p.x+Math.cos(r.heading)*.75,y:.3,z:p.y+Math.sin(r.heading)*.75},true);
   c.body.setRotation(r.body.rotation(),true);
   const frame={x:0,y:0,z:0,w:1};
   r.joint=world.createImpulseJoint(RAPIER.JointData.fixed({x:.75,y:0,z:0},frame,{x:0,y:0,z:0},frame),r.body,c.body,true);
   r.joint.setContactsEnabled(false);touching.delete([r.id,c.id].sort().join(':'));
  }
  if(name==='robot.release'){
   if(!r.holding)throw new Error('No held crate');const c=crates.get(r.holding);world.removeImpulseJoint(r.joint,true);r.joint=null;c.heldBy=null;c.body.setLinvel({x:0,y:0,z:0},true);r.holding=null;
  }
  r.caller={role:who.role,agentId:who.agentId};
  spend();commandsAtTick.set(r.id,(commandsAtTick.get(r.id)||0)+1);appendAction(who,name,args);return {accepted:true,tick,robotId:r.id};
 }
 emit(header);emit(snapshot());
 return {header,invoke,stop,accountAuditBytes,retainedLogCounts:()=>({records:lines.length,actions:actions.length}),step:n=>invoke({role:'coordinator',agentId:'coordinator'},'sim.step',{n}),status,snapshot,trajectory:()=>lines.join(''),actions:()=>structuredClone(actions),close(){if(!closed){closed=true;queue.free();world.free();}}};
}
export function verifyTrajectory(text){
 if(typeof text!=='string'||!text.endsWith('\n')||Buffer.byteLength(text)>256*1024*1024)throw new Error('Invalid trajectory framing');
 const records=text.trimEnd().split('\n').map(line=>JSON.parse(line));let previous='0'.repeat(64),tick=-1;
 for(let i=0;i<records.length;i++){const row=records[i],{hash:claimed,...payload}=row;if(row.previous!==previous||hash(payload)!==claimed)throw new Error('Trajectory hash mismatch');previous=claimed;
  if(i===0){if(row.kind!=='header'||![1,2].includes(row.version)||row.dt!==DT||row.engine!=='rapier3d-compat@0.17.3')throw new Error('Invalid trajectory header');validateScenario(row.scenario,{formatVersion:row.version});validateAssignments(row.assignments,row.scenario,{formatVersion:row.version});}
  else if(row.kind!=='tick'||row.tick!==++tick||row.time!==q(tick*DT))throw new Error('Trajectory tick discontinuity');
 }
 if(tick<0)throw new Error('Missing initial state');return {ticks:tick,records,finalHash:previous};
}
export async function replayActions(header,actions){
 const s=await createSim({scenario:header.scenario,seed:header.seed,assignments:header.assignments,maxTicks:header.maxTicks,formatVersion:header.version,maxRunBytes:header.maxRunBytes??null,budgetPolicy:header.budgetPolicy??'legacy',live:actions.some(a=>a.name==='robot.submit')});
 try{for(let i=0;i<actions.length;i++){const a=actions[i];if(a.order!==i||a.tick!==s.status().tick)throw new Error('Action order mismatch');if(header.version>=2&&(canonical(a.caller)!==canonical({role:a.identity.role,agentId:a.identity.agentId})||a.robotId!==(a.args.robotId||null)||canonical(a.robotIds)!==canonical(a.args.robotId?[a.args.robotId]:header.scenario.robots.map(r=>r.id).sort(compareIds))))throw new Error('Action caller or robot attribution mismatch');if(a.name==='recording.stop'){if(a.caller?.role!=='launcher'||a.caller.agentId!=='sim-launcher'||canonical(a.args)!==canonical({reason:'byte-budget'}))throw new Error('Invalid recording stop');s.stop();}else s.invoke(a.identity,a.name,a.args);}return s;}catch(e){s.close();throw e;}
}
