import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSim,verifyTrajectory,replayActions,hash,canonical} from '../src/sim.mjs';
import {createWorld,ENGINES} from '../src/engines/index.mjs';
import {startHub,defaultScenario,defaultAssignments} from '../src/hub.mjs';
import {runDemo} from '../tools/demo.mjs';
// The MuJoCo engine option: headless, in-process plus the real CLIs; no browser.
const root=fileURLToPath(new URL('../',import.meta.url));
const MUJOCO='mujoco@3.14.0',REFUSAL='Unknown physics engine: use rapier or mujoco';
const boss={role:'coordinator',agentId:'coordinator'},who=id=>({role:'robot',agentId:`script-${id}`,robotId:id});
const setup=extra=>{const scenario=defaultScenario();return createSim({scenario,assignments:defaultAssignments(scenario),...extra});};
const node=(args,cwd,timeout=10000)=>spawnSync(process.execPath,[join(root,args[0]),...args.slice(1)],{cwd,encoding:'utf8',timeout});
test('MuJoCo: same actions produce exact bytes, a full physics replay is byte-identical, and the motors really move',async()=>{
 const a=await setup({engine:'mujoco'}),b=await setup({engine:'mujoco'}),r=await setup();
 try{
  for(const s of [a,b,r]){s.invoke(who('amber'),'robot.drive',{robotId:'amber',v:1.2,w:.3,duration:2});s.invoke(who('teal'),'robot.goto',{robotId:'teal',x:-4.5,y:0});for(let i=0;i<3;i++)s.invoke(boss,'sim.step',{n:60});}
  assert.equal(a.trajectory(),b.trajectory());assert.equal(verifyTrajectory(a.trajectory()).ticks,180);assert.equal(a.header.engine,MUJOCO);
  const replay=await replayActions(a.header,a.actions());try{assert.equal(replay.header.engine,MUJOCO);assert.equal(replay.trajectory(),a.trajectory());}finally{replay.close();}
  const [amber,teal]=a.snapshot().robots;assert.ok(Math.hypot(amber.x+5,amber.y+3.5)>1,JSON.stringify(amber));assert.ok(Math.hypot(teal.x+4.5,teal.y)<.1,JSON.stringify(teal));
  // Rapier stays the default; the same script drives bounded motors under MuJoCo, so the two engines never share a state.
  assert.equal(r.header.engine,ENGINES.rapier);assert.notDeepEqual(a.snapshot().robots.map(x=>[x.x,x.y,x.heading]),r.snapshot().robots.map(x=>[x.x,x.y,x.heading]));
 }finally{for(const s of [a,b,r])s.close();}
});
test('MuJoCo: engine ids match the pinned dependencies and every run header records the engine; the verifier rejects unknown engines and non-Rapier version-1 headers',async()=>{
 const inventory=JSON.parse(await readFile(new URL('../tools/dependency-files.json',import.meta.url),'utf8'));const deps=Object.fromEntries(Object.entries(inventory).map(([name,entry])=>[name,entry.version]));
 assert.deepEqual(ENGINES,{rapier:`rapier3d-compat@${deps['@dimforge/rapier3d-compat']}`,mujoco:`mujoco@${deps['@mujoco/mujoco']}`});assert.equal(ENGINES.mujoco,MUJOCO);
 const d=await setup();try{assert.equal(d.header.engine,ENGINES.rapier);}finally{d.close();}
 await assert.rejects(setup({formatVersion:1,engine:'mujoco'}),{message:'Version-1 recordings require the rapier engine'});const v1=await setup({formatVersion:1});try{assert.equal(v1.header.version,1);assert.equal(v1.header.engine,ENGINES.rapier);}finally{v1.close();}
 const s=await setup({engine:'mujoco'});let text;try{s.step(1);assert.equal(s.header.engine,MUJOCO);text=s.trajectory();}finally{s.close();}
 const first=JSON.parse(text.slice(0,text.indexOf('\n')));assert.equal(first.kind,'header');assert.equal(first.engine,MUJOCO);assert.equal(verifyTrajectory(text).records[0].engine,MUJOCO);
 const rewrite=change=>{const {hash:_,...header}=first;change(header);return canonical({...header,hash:hash(header)})+text.slice(text.indexOf('\n'));};
 assert.equal(rewrite(()=>{}),text);
 assert.throws(()=>verifyTrajectory(rewrite(h=>h.engine='bullet@3.25')),/Invalid trajectory header/);assert.throws(()=>verifyTrajectory(rewrite(h=>h.version=1)),/Invalid trajectory header/);
 const temp=await mkdtemp(join(tmpdir(),'sim-mujoco-hub-'));let hub;
 try{
  hub=await startHub({root:join(temp,'hub'),engine:'mujoco'});assert.equal(hub.engine,MUJOCO);
  const cfg=JSON.parse(await readFile(hub.connections.coordinator,'utf8'));
  const reset=await fetch(cfg.url+'/call',{method:'POST',headers:{authorization:`Bearer ${cfg.token}`,'content-type':'application/json'},body:JSON.stringify({method:'tools/call',params:{name:'sim.reset',arguments:{}}}),signal:AbortSignal.timeout(5000)});
  assert.equal((await reset.json()).result.run,'run-0002');
  for(const run of ['run-0001','run-0002']){const saved=await readFile(join(temp,'hub',run,'trajectory.jsonl'),'utf8'),header=JSON.parse(saved.slice(0,saved.indexOf('\n')));assert.equal(header.kind,'header');assert.equal(header.engine,MUJOCO);}
 }finally{await hub?.close();await rm(temp,{recursive:true,force:true});}
});
test('MuJoCo demo: node tools/demo.mjs --engine mujoco delivers 3/3 crates with 0 collisions, is byte-identical across processes and replays',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'sim-mujoco-demo-'));
 try{
  const a=await runDemo({output:join(temp,'a'),engine:'mujoco'});
  assert.equal(a.engine,MUJOCO);assert.equal(a.status.delivered,3);assert.equal(a.status.collisions,0);assert.equal(a.status.tick,600);assert.equal(a.status.complete,true);assert.equal(a.status.score,300);assert.equal(a.clientsExited,4);
  const cli=node(['tools/demo.mjs','--output',join(temp,'b'),'--engine','mujoco'],temp,60000);assert.equal(cli.status,0,cli.stderr);
  const b=JSON.parse(cli.stdout);assert.equal(b.engine,MUJOCO);assert.deepEqual(b.status,a.status);assert.equal(JSON.parse(await readFile(join(temp,'b','demo-receipt.json'),'utf8')).engine,MUJOCO);
  const x=await readFile(join(temp,'a','trajectory.jsonl'),'utf8');assert.equal(x,await readFile(join(temp,'b','trajectory.jsonl'),'utf8'));
  const checked=verifyTrajectory(x);assert.equal(checked.ticks,600);assert.equal(checked.records[0].engine,MUJOCO);
  const replay=node(['tools/replay.mjs',join(temp,'b')],temp,60000);assert.equal(replay.status,0,replay.stderr);
  const verdict=JSON.parse(replay.stdout);assert.equal(verdict.ok,true);assert.equal(verdict.ticks,600);assert.equal(verdict.trajectorySha256,hash(x));assert.equal(verdict.finalHash,checked.finalHash);
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('unknown engine names are refused with one clear message before any world or run state exists',async()=>{
 const message={message:REFUSAL},scenario=defaultScenario(),assignments=defaultAssignments(scenario);
 for(const engine of ['bullet','','Rapier','MuJoCo',ENGINES.mujoco,'__proto__','constructor'])await assert.rejects(createSim({scenario,assignments,engine}),message);
 await assert.rejects(createWorld('bullet',1/60),message);
 const recorded=await setup({engine:'mujoco'});try{recorded.step(1);for(const engine of ['bullet@3.25','mujoco','',undefined])await assert.rejects(replayActions({...recorded.header,engine},recorded.actions()),message);}finally{recorded.close();}
 const temp=await mkdtemp(join(tmpdir(),'sim-mujoco-refuse-'));
 try{
  await assert.rejects(startHub({root:join(temp,'hub'),engine:'bullet'}),message);assert.deepEqual(await readdir(join(temp,'hub')),[]);
  const work=join(temp,'work.json');await writeFile(work,JSON.stringify({assignments:assignments.map(a=>({...a,driverLabel:'SCRIPT'}))}));
  for(const args of [['src/hub-cli.mjs','--root',join(temp,'hub-cli')],['tools/live.mjs','--root',join(temp,'live'),'--work-record',work,'--json']]){
   const result=node([...args,'--engine','bullet'],temp);
   assert.equal(result.status,1,`${args[0]}: ${result.stderr}`);assert.equal(result.stdout,'');assert.equal(result.stderr.trim(),REFUSAL);assert.deepEqual(await readdir(args[2]),[]);
  }
  // A trailing --engine, or one followed by another option, is refused rather than silently running Rapier.
  for(const args of [['src/hub-cli.mjs','--root',join(temp,'hub-bare')],['tools/demo.mjs','--output',join(temp,'demo-bare')],['src/hub-cli.mjs','--engine','--root',join(temp,'hub-swapped')]]){
   const result=node([...args,...(args[1]==='--engine'?[]:['--engine'])],temp);
   assert.equal(result.status,1,`${args.join(' ')}: ${result.stderr}`);assert.equal(result.stdout,'');assert.equal(result.stderr.trim(),'--engine requires a value');await assert.rejects(readdir(args.at(-1)),{code:'ENOENT'});
  }
  const demo=node(['tools/demo.mjs','--output',join(temp,'demo'),'--engine','bullet'],temp);
  assert.equal(demo.status,1);assert.equal(demo.stdout,'');assert.equal(demo.stderr.trim(),REFUSAL);await assert.rejects(readdir(join(temp,'demo')),{code:'ENOENT'});
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('MuJoCo: ids that contain the old name separator build distinct MJCF names, so both engines accept, grasp and replay the same id set',async()=>{
 // Robots a and a__b with crates b__x and x once produced the weld name a__b__x twice and MuJoCo refused the scene.
 const scenario=defaultScenario();[scenario.robots[0].id,scenario.robots[1].id,scenario.robots[2].id]=['a','a__b','c'];[scenario.crates[0].id,scenario.crates[1].id,scenario.crates[2].id]=['b__x','x','y'];
 const assignments=defaultAssignments(scenario),crate=scenario.crates.find(c=>c.id===assignments.find(a=>a.robotId==='a').crateId),agent=who('a');
 for(const engine of ['rapier','mujoco']){
  const s=await createSim({scenario,assignments,engine});
  try{
   s.invoke(agent,'robot.goto',{robotId:'a',x:crate.x-.7,y:crate.y});s.step(60);s.step(60);s.invoke(agent,'robot.grab',{robotId:'a',crateId:crate.id});s.step(60);
   assert.equal(s.snapshot().robots.find(r=>r.id==='a').holding,crate.id);assert.equal(s.snapshot().crates.find(c=>c.id===crate.id).heldBy,'a');
   s.invoke(agent,'robot.release',{robotId:'a'});s.step(60);assert.equal(s.snapshot().crates.find(c=>c.id===crate.id).heldBy,null);
   assert.equal(s.header.engine,ENGINES[engine]);assert.equal(verifyTrajectory(s.trajectory()).ticks,240);
   const replay=await replayActions(s.header,s.actions());try{assert.equal(replay.trajectory(),s.trajectory());}finally{replay.close();}
  }finally{s.close();}
 }
});
