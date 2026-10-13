import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startHub} from '../src/hub.mjs';
import {McpClient} from '../tools/mcp-client.mjs';
import {runDemo} from '../tools/demo.mjs';
import {verifyTrajectory} from '../src/sim.mjs';
test('three real stdio clients complete warehouse and a second run is byte-identical', async()=>{
 const root=await mkdtemp(join(tmpdir(),'sim-demo-'));
 try {
  const a=await runDemo({output:join(root,'a')}); const b=await runDemo({output:join(root,'b')});
  assert.equal(a.status.delivered,3); assert.equal(a.status.collisions,0); assert.equal(a.status.tick,600);
  const x=await readFile(join(root,'a','trajectory.jsonl'),'utf8'); assert.equal(x,await readFile(join(root,'b','trajectory.jsonl'),'utf8'));
  assert.equal(verifyTrajectory(x).ticks,600); assert.equal(a.clientsExited,4);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('MCP schemas, role surface, malformed requests, EOF and immutable old runs', async()=>{
 const root=await mkdtemp(join(tmpdir(),'sim-mcp-')); let hub; const clients=[];
 try {
  hub=await startHub({root}); const c=new McpClient(hub.connections.coordinator); clients.push(c); await c.initialize();
  const robot=new McpClient(hub.connections.amber); clients.push(robot); await robot.initialize();
  const list=await c.request('tools/list',{}); const golden=JSON.parse(await readFile(new URL('./fixtures/tools.json',import.meta.url),'utf8')); assert.deepEqual(list.tools,golden);
  const rlist=await robot.request('tools/list',{}); assert.equal(rlist.tools.length,6); assert.ok(!rlist.tools.some(t=>t.name==='sim.reset'));
  for(const response of [await robot.call('sim.status',{}),await robot.call('sim.observe',{robotId:'amber'})]){assert.match(response.deliveryRule,/released.*fully inside/);assert.equal(response.deliveryAreas[0].centerBounds.minX,4.300001);}
  await assert.rejects(robot.call('sim.reset',{})); await assert.rejects(robot.call('robot.drive',{robotId:'teal',v:1,w:0,duration:1}));
  await assert.rejects(c.request('made/up',{}));
  await c.call('sim.step',{n:1}); const old=await readFile(join(root,'run-0001','trajectory.jsonl'));
  await c.call('sim.reset',{}); assert.deepEqual(await readFile(join(root,'run-0001','trajectory.jsonl')),old);
  assert.equal((await c.call('sim.status',{})).tick,0);
  const res=await fetch(hub.url+'/call',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}); assert.equal(res.status,401);
  const foreign=await fetch(hub.url+'/call',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:'{}'}); assert.equal(foreign.status,403);
 }finally {for(const c of clients) await c.close(); if(hub)await hub.close();await rm(root,{recursive:true,force:true});}
});
// Directory policy P-5E: every tool declares a title and its hints; the top-level title equals annotations.title. These are the reviewed values, read from each
// handler in src/sim.mjs and src/hub.mjs; changing one must be a deliberate edit here.
const write=title=>({title,readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false});
const read=title=>({title,readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
const reviewedAnnotations={'sim.observe':read('Observe robot'),'robot.drive':write('Drive robot'),'robot.goto':write('Move robot to waypoint'),'robot.grab':write('Grab crate'),'robot.release':write('Release crate'),'robot.submit':write('Submit live round'),'sim.status':read('Read simulation status'),'sim.step':write('Advance shared world'),'sim.reset':write('Restart shared world'),'sim.scenario':write('Start scenario run'),'sim.assign':write('Assign crate work'),'sim.assignments':read('Read assignments')};
test('every tool the real server lists declares its reviewed title and hints, in manual and live mode',async()=>{
 const seen=new Set();
 for(const live of [false,true]){
  const root=await mkdtemp(join(tmpdir(),'sim-annotations-'));let hub;const clients=[];
  try{
   hub=await startHub({root,...(live?{live:{budgetMs:120000}}:{})});
   for(const id of ['coordinator','amber']){
    const c=new McpClient(hub.connections[id]);clients.push(c);await c.initialize();
    for(const tool of (await c.request('tools/list',{})).tools){
     const a=tool.annotations;assert.equal(typeof a?.title,'string',tool.name);assert.ok(a.title.trim(),tool.name);
     assert.equal(tool.title,a.title,tool.name+': top-level title (MCP 2025-06-18) equals annotations.title');
     assert.equal(typeof a.readOnlyHint,'boolean',tool.name);assert.equal(typeof a.destructiveHint,'boolean',tool.name);
     assert.deepEqual(a,reviewedAnnotations[tool.name],tool.name);seen.add(tool.name);
    }
   }
  }finally{for(const c of clients)await c.close();await hub?.close();await rm(root,{recursive:true,force:true});}
 }
 assert.deepEqual([...seen].sort(),Object.keys(reviewedAnnotations).sort());
});
