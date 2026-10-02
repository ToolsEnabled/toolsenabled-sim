import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startHub} from '../src/hub.mjs';
import {McpClient} from '../tools/mcp-client.mjs';
import {verifyTrajectory,replayActions} from '../src/sim.mjs';
async function fixture(options,fn,maxTicks=120){
 const root=await mkdtemp(join(tmpdir(),'sim-live-'));let hub;const clients={};
 try{hub=await startHub({root,live:options,maxTicks});for(const [id,path] of Object.entries(hub.connections)){clients[id]=new McpClient(path);await clients[id].initialize();}await fn({hub,clients,root});}
 finally{for(const c of Object.values(clients))await c.close();if(hub)await hub.close();await rm(root,{recursive:true,force:true});}
}
async function replay(run){const bytes=await readFile(join(run,'trajectory.jsonl'),'utf8');const checked=verifyTrajectory(bytes),actions=(await readFile(join(run,'actions.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);const s=await replayActions(checked.records[0],actions);try{assert.equal(s.trajectory(),bytes);}finally{s.close();}}
test('live default 120 s barrier tolerates a slow stdio agent and rejects stale or unbound submissions',async()=>{
 await fixture({},async({clients:c,hub})=>{
  const status=()=>c.coordinator.call('sim.status',{});const first=await status();assert.equal(first.live.budgetMs,120000);const round=first.live.round;
  await assert.rejects(c.coordinator.call('sim.step',{n:60}),/Live/);
  await assert.rejects(c.amber.call('robot.drive',{robotId:'amber',v:1,w:0,duration:1}),/round/);
  await assert.rejects(c.amber.call('robot.submit',{robotId:'teal',round}),/ownership/);
  await c.amber.call('robot.drive',{robotId:'amber',v:.1,w:0,duration:5,round});
  await c.amber.call('robot.submit',{robotId:'amber',round});await c.teal.call('robot.submit',{robotId:'teal',round});
  await assert.rejects(c.amber.call('robot.drive',{robotId:'amber',v:1,w:0,duration:1,round}),/submitted/);
  await delay(11000);assert.equal((await status()).tick,0);
  const last=await c.violet.call('robot.submit',{robotId:'violet',round});assert.equal(last.tick,60);assert.notEqual(last.live.round,round);
  await assert.rejects(c.violet.call('robot.submit',{robotId:'violet',round}),/Stale/);
  await assert.rejects(c.amber.call('robot.drive',{robotId:'amber',v:1,w:0,duration:1,round}),/Stale/);
  await replay(hub.runDir);
  await c.coordinator.call('sim.reset',{});await assert.rejects(c.amber.call('robot.submit',{robotId:'amber',round}),/Stale/);
 });
});
test('live deadline stops a missing robot with continuing motion, records holds and replays exact bytes',async()=>{
 await fixture({budgetMs:2000,activeRobots:['amber']},async({clients:c,hub})=>{
  const first=await c.amber.call('sim.status',{});await c.amber.call('robot.drive',{robotId:'amber',v:.1,w:0,duration:5,round:first.live.round});
  await c.amber.call('robot.submit',{robotId:'amber',round:first.live.round});
  const p=await c.amber.call('sim.observe',{robotId:'amber'});assert.equal(p.tick,60);
  await assert.rejects(c.teal.call('robot.submit',{robotId:'teal',round:(await c.teal.call('sim.status',{})).live.round}),/inactive/);
  await delay(2200);const done=await c.amber.call('sim.status',{});assert.equal(done.tick,120);assert.equal(done.live.stopped,'tick-budget');
  const after=await c.amber.call('sim.observe',{robotId:'amber'});assert.deepEqual({x:after.pose.x,y:after.pose.y},{x:p.pose.x,y:p.pose.y});
  const decisions=(await readFile(join(hub.runDir,'live.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(d=>d.kind==='commit');assert.deepEqual(decisions.map(d=>d.reason),['submitted','deadline']);assert.ok(decisions[1].holding.includes('amber'));
  await replay(hub.runDir);
 });
});
test('live rejects invalid active sets and budgets before creating a run',async()=>{
 for(const live of [{budgetMs:0},{budgetMs:Infinity},{activeRobots:[]},{activeRobots:['missing']},{activeRobots:['amber','amber']},{stepTicks:61}])await assert.rejects(fixture(live,()=>{}));
});
test('live holds still commit after the robot exhausts its command budget',async()=>{
 // Allow slow CI enough time to fill the command budget. A one-step run makes
 // the deadline assertion independent of how late the test process resumes.
 await fixture({budgetMs:15000,activeRobots:['amber'],stepTicks:7},async({clients:c,hub})=>{
  const {live}=await c.amber.call('sim.status',{});const before=await c.amber.call('sim.observe',{robotId:'amber'});
  for(let i=0;i<63;i++)await c.amber.call('robot.drive',{robotId:'amber',v:1,w:0,duration:5,round:live.round});
  await assert.rejects(c.amber.call('robot.drive',{robotId:'amber',v:1,w:0,duration:5,round:live.round}),/budget/);
  const until=Date.now()+30000;let p;
  do{await delay(50);p=await c.amber.call('sim.observe',{robotId:'amber'});}while(p.tick===0&&Date.now()<until);
  assert.equal(p.tick,7);assert.equal(p.pose.x,before.pose.x);await replay(hub.runDir);
 },7);
});
test('live launcher prints per-agent Claude Code and Codex registration and binds the actual stdio role',async()=>{
 const {spawn}=await import('node:child_process');const {writeFile}=await import('node:fs/promises');const {defaultAssignments,defaultScenario}=await import('../src/hub.mjs');
 const root=await mkdtemp(join(tmpdir(),"sim live ' "));let child,client;let closed;
 try{
  const assignments=defaultAssignments(defaultScenario()).map((a,i)=>({...a,agentId:`driver-${i}`,driverLabel:['CLAUDE CODE','CODEX','LOCAL DRIVER'][i]}));
  const work=join(root,'work.json');await writeFile(work,JSON.stringify({assignments}));
  child=spawn(process.execPath,[new URL('../tools/live.mjs',import.meta.url).pathname,'--root',join(root,'hub'),'--work-record',work,'--json'],{stdio:['ignore','pipe','pipe']});
  closed=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));let stderr='';child.stderr.on('data',b=>stderr+=b);
  const result=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Launcher output timeout '+stderr)),10000);child.stdout.on('data',b=>{output+=b;try{const r=JSON.parse(output);clearTimeout(timer);resolve(r);}catch{}});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Launcher exited '+stderr));});});
  assert.equal(result.budgetMs,120000);assert.equal(result.registrations.length,4);
  for(const r of result.registrations){assert.match(r.claudeCode.command,/claude mcp add-json --scope local/);assert.match(r.codex.command,/codex mcp add toolsenabled_sim --env/);assert.equal(r.claudeCode.config.mcpServers.toolsenabled_sim.env.SIM_CONNECTION,r.connection);assert.match(r.codex.config,/\[mcp_servers.toolsenabled_sim.env\]/);assert.ok(!JSON.stringify(r).includes('token'));}
  const robot=result.registrations.find(r=>r.robotId==='teal');assert.equal(robot.driverLabel,'CODEX');client=new McpClient(robot.connection);await client.initialize();const list=await client.request('tools/list',{});assert.equal(list.tools.length,7);assert.ok(list.tools.some(t=>t.name==='robot.submit'));
  const golden=JSON.parse(await readFile(new URL('./fixtures/live-tools.json',import.meta.url),'utf8'));const {toolList}=await import('../src/schema.mjs');assert.deepEqual(toolList('coordinator',{live:true}),golden);
  assert.equal((await client.call('sim.observe',{robotId:'teal'})).pose.agentId,'driver-1');await assert.rejects(client.call('sim.reset',{}),/Coordinator/);await assert.rejects(client.call('sim.observe',{robotId:'amber'}),/ownership/);
 }finally{if(client)await client.close();if(child){child.kill('SIGTERM');assert.equal((await closed).code,0);}await rm(root,{recursive:true,force:true});}
});

test('live warehouse commits final releases before stopping and preserves completed state in replay',async()=>{
 await fixture({},async({clients:c,hub})=>{
  const {defaultScenario}=await import('../src/hub.mjs');const scene=defaultScenario();
  let round=(await c.coordinator.call('sim.status',{})).live.round;
  const cmd=(r,name,args={})=>c[r.id].call(name,{robotId:r.id,...args,round});
  const submit=async()=>{let status;for(const r of scene.robots)status=await cmd(r,'robot.submit');round=status.live.round;return status;};
  for(let i=0;i<scene.robots.length;i++){const crate=scene.crates[i];await cmd(scene.robots[i],'robot.goto',{x:crate.x-.7,y:crate.y});}
  await submit();await submit();
  for(let i=0;i<scene.robots.length;i++){const crate=scene.crates[i],zone=scene.zones.find(z=>z.id===crate.zone);await cmd(scene.robots[i],'robot.grab',{crateId:crate.id});await cmd(scene.robots[i],'robot.goto',{x:zone.x-.7,y:zone.y});}
  for(let i=0;i<7;i++)await submit();
  for(const r of scene.robots)await cmd(r,'robot.release');
  const final=await submit();assert.equal(final.tick,600);assert.equal(final.live.stopped,'complete');assert.equal(final.delivered,3);assert.equal(final.collisions,0);
  const checked=verifyTrajectory(await readFile(join(hub.runDir,'trajectory.jsonl'),'utf8'));assert.equal(checked.records.at(-1).status.complete,true);await replay(hub.runDir);
 },600);
});
