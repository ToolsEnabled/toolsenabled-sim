import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {startHub,defaultScenario} from '../src/hub.mjs';
const cli=resolve('tools/sim-view.mjs');
const run=(args,env={},input='')=>new Promise(resolve=>{const p=spawn(process.execPath,[cli,...args,'--json'],{env,stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('close',code=>{let body;try{body=JSON.parse(out);}catch{}resolve({code,body,out,err});});p.stdin.end(input);});
async function setup(live=false){const root=await mkdtemp(join(tmpdir(),'sim-audit-view-'));const hub=await startHub({root,...(live?{live:{budgetMs:120000}}:{})});return {root,hub,env:role=>({SIM_CONNECTION:hub.connections[role],SIM_RUN_ROOT:root}),async close(){await hub.close();await rm(root,{recursive:true,force:true});}};}
test('help works without configuration and prints native actions and exact Codex skill names',async()=>{
 let offset=0;const rows=[];
 do{const r=await run(['help','--offset',String(offset)]);assert.equal(r.code,0,r.err);rows.push(...r.body.rows);offset=r.body.nextOffset;}while(offset!==null);
 const text=JSON.stringify(rows);for(const name of ['help','map','scenarios','replay','connection'])assert.ok(text.includes('/sim '+name));
 for(const name of ['deliver','move','hold','submit','reset','step','assign','scenario'])assert.ok(text.includes('/toolsenabled-sim:'+name));
 assert.ok(text.includes('$toolsenabled-sim:toolsenabled-sim'));
});
test('peers expose only poses and holding while the bound robot has its own mapping',async()=>{
 const f=await setup();try{
  const r=await run(['robots'],f.env('amber'));assert.equal(r.code,0,r.err);assert.equal(r.body.rows.length,3);
  const peer=JSON.stringify(r.body.rows.find(x=>x.id==='teal'));assert.match(peer,/Position|position/);assert.doesNotMatch(peer,/script-teal|script-task-teal|script-ledger-teal|cargo-b/);
  assert.equal(r.body.whoami.robotId,'amber');assert.ok(!r.body.actionContext.assignments);
  const coordinator=await run(['robots'],f.env('coordinator'));assert.equal(coordinator.body.actionContext.assignments.length,3);
 }finally{await f.close();}
});
test('map, scenarios and connection are bounded read-only views with no token or URL',async()=>{
 const f=await setup();try{
  const before=await readFile(join(f.hub.runDir,'actions.jsonl')),c=JSON.parse(await readFile(f.hub.connections.amber));
  for(const view of ['map','scenarios','connection']){
   const r=await run([view],f.env('amber'));assert.equal(r.code,0,r.err);assert.equal(r.body.view,view);assert.ok(r.body.rows.length);assert.ok(!r.out.includes(c.token));assert.ok(!r.out.includes(c.url));assert.ok(r.out.length<65536);
  }
  assert.deepEqual(await readFile(join(f.hub.runDir,'actions.jsonl')),before);
 }finally{await f.close();}
});
test('clean shutdown leaves offline history anchored without guessing an active run or exposing peer mappings',async()=>{
 const f=await setup();try{
  const env=f.env('amber');await f.hub.close();
  for(const view of ['status','robots','runs','replay']){const r=await run([view],env);assert.equal(r.code,0,r.err);assert.equal(r.body.online,false);assert.doesNotMatch(r.out,/script-teal|script-task-teal|script-ledger-teal/);}
  const explicit=await run(['runs','--root',f.root]);assert.equal(explicit.code,0,explicit.err);assert.equal(explicit.body.rows[0].id,'run-0001');
 }finally{await f.close();}
});
test('action preflight binds robotId, role and mode before any model turn, and never mutates',async()=>{
 for(const live of [false,true]){
  const f=await setup(live);try{
   const before=await readFile(join(f.hub.runDir,'actions.jsonl'));
   const plan=async(role,verb,args=[])=>{const r=await run(['action'],f.env(role),JSON.stringify({verb,args}));assert.equal(r.code,0,r.err);return r.body;};
   const move=await plan('amber','move',[1,2]);assert.equal(move.allowed,true);assert.equal(move.request.robotId,'amber');assert.equal(move.request.mode,live?'live':'manual');
   assert.equal((await plan('amber','reset')).allowed,false);assert.equal((await plan('amber','step',[1])).allowed,false);
   assert.equal((await plan('coordinator','submit')).allowed,false);assert.equal((await plan('coordinator','step',[1])).allowed,!live);
   assert.equal((await plan('coordinator','deliver',['amber'])).allowed,!live);assert.equal((await plan('coordinator','deliver')).allowed,false);
   assert.equal((await plan('amber','deliver',['teal'])).allowed,false);assert.equal((await plan('amber','move',[100,100])).allowed,false);
   assert.equal((await plan('amber','submit')).allowed,live);
   assert.deepEqual(await readFile(join(f.hub.runDir,'actions.jsonl')),before);
  }finally{await f.close();}
 }
});
test('scenario checks validate JSON without exposing raw bodies and replay is guidance until explicitly verified',async()=>{
 const f=await setup();try{
  const path=join(f.root,'draft.json');await writeFile(path,JSON.stringify(defaultScenario()),{mode:0o600});
  const checked=await run(['scenarios','--check',path],f.env('coordinator'));assert.equal(checked.code,0,checked.err);assert.match(checked.out,/valid/i);
  const request=await run(['action'],f.env('coordinator'),JSON.stringify({verb:'scenario',args:[path]}));assert.equal(request.code,0,request.err);assert.equal(request.body.allowed,true);assert.equal(request.body.request.scenario.name,defaultScenario().name);assert.ok(!request.out.includes(path));
  await f.hub.close();const guidance=await run(['replay','--root',f.root]);assert.equal(guidance.code,0,guidance.err);assert.match(guidance.out,/tools\/replay\.mjs/);assert.match(guidance.out,/tools\/capture\.mjs/);assert.match(guidance.out,/Chromium/);assert.ok(!guidance.body.verified);
 }finally{await f.close();}
});
test('manual reassignment is visible online and in the archived view without rewriting replay files',async()=>{
 const f=await setup();try{
  const c=JSON.parse(await readFile(f.hub.connections.coordinator));
  const response=await fetch(c.url+'/call',{method:'POST',headers:{authorization:`Bearer ${c.token}`},body:JSON.stringify({method:'tools/call',params:{name:'sim.assign',arguments:{robotId:'amber',crateId:'cargo-a',taskId:'replacement-task',ledgerId:'replacement-ledger'}}})});assert.ok(!(await response.json()).error);
  const online=await run(['robots'],f.env('amber'));assert.match(online.out,/replacement-task/);assert.doesNotMatch(online.out,/script-task-amber/);
  const env=f.env('coordinator');await f.hub.close();const offline=await run(['robots'],env);assert.equal(offline.code,0,offline.err);
  // A missing capability file has no verified role: no work mapping is shown.
  assert.doesNotMatch(offline.out,/replacement-task|script-task/);
 }finally{await f.close();}
});
test('merged events keep caller attribution, summarize scenario bodies and exclude peer holds',async()=>{
 const f=await setup(true);try{
  const actions=[
   {order:0,tick:0,name:'robot.drive',caller:{role:'coordinator',agentId:'coordinator'},robotId:'amber',args:{robotId:'amber',v:0,w:0,duration:1}},
   {order:1,tick:0,name:'robot.drive',caller:{role:'robot',agentId:'script-teal'},robotId:'teal',args:{robotId:'teal'}},
   {order:2,tick:0,name:'sim.scenario',caller:{role:'coordinator',agentId:'coordinator'},robotId:null,args:{scenario:{...defaultScenario(),extra:'RAW-SCENARIO-BODY'},assignments:[]}},
  ];
  await writeFile(join(f.hub.runDir,'actions.jsonl'),actions.map(a=>JSON.stringify(a)+'\n').join(''));
  await writeFile(join(f.hub.runDir,'live.jsonl'),[
   {kind:'hold',caller:{role:'launcher',agentId:'sim-launcher'},robotId:'teal',round:'1:0',reason:'deadline'},
   {kind:'commit',caller:{role:'launcher',agentId:'sim-launcher'},robotId:null,round:'1:0',reason:'deadline'},
  ].map(a=>JSON.stringify(a)+'\n').join(''));
  const own=await run(['events'],f.env('amber'));assert.equal(own.code,0,own.err);assert.equal(own.body.rows.length,2);assert.match(own.out,/coordinator/);assert.match(own.out,/commit/);assert.doesNotMatch(own.out,/script-teal|Robot: teal|RAW-SCENARIO-BODY/);
  const coord=await run(['events'],f.env('coordinator'));assert.equal(coord.body.rows.length,5);assert.match(coord.out,/3 robots/);assert.doesNotMatch(coord.out,/RAW-SCENARIO-BODY/);
 }finally{await f.close();}
});
