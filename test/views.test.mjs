import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {startHub} from '../src/hub.mjs';

async function fixture(options={}) {
 const root=await mkdtemp(join(tmpdir(),'sim-view-'));const hub=await startHub({root,...options});
 const identity=async robot=>JSON.parse(await readFile(hub.connections[robot],'utf8'));
 const request=async(robot,query={},init={})=>{
  const c=await identity(robot),res=await fetch(c.url+'/view?'+new URLSearchParams(query),{...init,headers:{authorization:`Bearer ${c.token}`,...init.headers}});
  return {status:res.status,body:await res.json()};
 };
 const call=async(robot,name,args={})=>{const c=await identity(robot);return (await fetch(c.url+'/call',{method:'POST',headers:{authorization:`Bearer ${c.token}`},body:JSON.stringify({method:'tools/call',params:{name,arguments:args}})})).json();};
 return {root,hub,request,identity,call,async close(){await hub.close();await rm(root,{recursive:true,force:true});}};
}
test('views use capability identity, never MCP dispatch, writes or round expiry',async()=>{
 const f=await fixture({live:{budgetMs:120000,stepTicks:1}});
 try{
  const before=await Promise.all(['trajectory.jsonl','actions.jsonl','live.jsonl'].map(n=>readFile(join(f.hub.runDir,n))));
  const status=await f.request('amber',{view:'status'});assert.equal(status.status,200);assert.equal(status.body.schema,'ai.toolsenabled/sim-view/v1');
  assert.equal(status.body.identity.robotId,'amber');assert.match(JSON.stringify(status.body),/awaiting|Awaiting/);
  const robots=await f.request('amber',{view:'robots'});assert.deepEqual(robots.body.rows.map(r=>r.id),['amber','teal','violet']);
  assert.equal((await f.request('coordinator',{view:'robots'})).body.rows.length,3);
  assert.equal((await fetch(f.hub.url+'/view?view=status')).status,401);
  assert.equal((await f.request('amber',{view:'status'},{headers:{origin:'http://untrusted'}})).status,403);
  assert.equal((await f.request('amber',{view:'status',robotId:'teal'})).status,400);
  assert.equal((await f.request('amber',{view:'status'},{method:'POST'})).status,404);
  const after=await Promise.all(['trajectory.jsonl','actions.jsonl','live.jsonl'].map(n=>readFile(join(f.hub.runDir,n))));assert.deepEqual(after,before);
 }finally{await f.close();}
});
test('run history pages beyond 50, pins revisions and refuses symlinked state',async()=>{
 const f=await fixture();
 try{
  const trajectory=await readFile(join(f.hub.runDir,'trajectory.jsonl'));
  for(let i=2;i<=63;i++){const dir=join(f.root,`run-${String(i).padStart(4,'0')}`);await mkdir(dir,{mode:0o700});await writeFile(join(dir,'trajectory.jsonl'),trajectory,{mode:0o600});}
  let offset=0,revision;const ids=[];
  do{const r=await f.request('amber',{view:'runs',offset:String(offset),...(revision?{revision}:{})});assert.equal(r.status,200);revision=r.body.revision;ids.push(...r.body.rows.map(x=>x.id));offset=r.body.nextOffset;}while(offset!==null);
  assert.equal(ids.length,63);assert.equal(new Set(ids).size,63);
  await mkdir(join(f.root,'run-0064'),{mode:0o700});
  await writeFile(join(f.root,'run-0064','trajectory.jsonl'),trajectory,{mode:0o600});
  assert.equal((await f.request('amber',{view:'runs',offset:'10',revision})).status,409);
  await symlink(f.hub.runDir,join(f.root,'run-0065'));
  const unsafe=await f.request('coordinator',{view:'runs'});assert.equal(unsafe.status,400);assert.doesNotMatch(JSON.stringify(unsafe.body),new RegExp(f.root));
 }finally{await f.close();}
});
test('event pages retain caller attribution, filter ownership and detect a changed revision',async()=>{
 const f=await fixture();
 try{
  for(let i=0;i<15;i++){
   await f.call('amber','robot.drive',{robotId:'amber',v:0,w:0,duration:1});
   await f.call('teal','robot.drive',{robotId:'teal',v:0,w:0,duration:1});
  }
  const first=await f.request('amber',{view:'events'});assert.equal(first.status,200);assert.equal(first.body.rows.length,10);
  assert.ok(first.body.rows.every(r=>r.lines.join(' ').includes('script-amber')&&!r.lines.join(' ').includes('script-teal')));
  assert.notEqual(first.body.nextCursor,null);
  const second=await f.request('amber',{view:'events',revision:first.body.revision,cursor:String(first.body.nextCursor)});
  assert.equal(second.status,200);assert.equal(second.body.rows.length,5);assert.equal(second.body.nextCursor,null);
  assert.equal(new Set([...first.body.rows,...second.body.rows].map(r=>r.id)).size,15);
  await f.call('amber','robot.drive',{robotId:'amber',v:0,w:0,duration:1});
  assert.equal((await f.request('amber',{view:'events',revision:first.body.revision,cursor:String(first.body.nextCursor)})).status,409);
  assert.equal((await f.request('amber',{view:'events',cursor:'5'})).status,400);
 }finally{await f.close();}
});
test('all view text is bounded and terminal-safe, with raw caller names never interpreted',async()=>{
 const f=await fixture();
 try{
  const line={order:0,tick:0,name:'robot.drive\u001b]52;c;payload\u0007',caller:{role:'robot',agentId:'script-amber'},robotId:'amber',args:{task:'\u202eunsafe'}};
  await writeFile(join(f.hub.runDir,'actions.jsonl'),JSON.stringify(line)+'\n');
  const r=await f.request('amber',{view:'events'});assert.equal(r.status,200);
  assert.equal(r.body.rows.length,1);const text=r.body.rows[0].lines.join(' ')+r.body.rows[0].title;
  assert.doesNotMatch(text,/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/);
  assert.ok(text.includes('\\u001b'));assert.ok(JSON.stringify(r.body).length<65536);
 }finally{await f.close();}
});
test('CLI uses the same read-only view with explicit connection environment and plain errors',async()=>{
 const f=await fixture();const entry=resolve('tools/sim-view.mjs');
 const run=env=>new Promise(resolve=>{let stdout='',stderr='';const p=spawn(process.execPath,[entry,'robots','--json'],{env,stdio:['ignore','pipe','pipe']});p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('close',code=>resolve({code,stdout,stderr}));});
 try{
  const result=await run({SIM_CONNECTION:f.hub.connections.amber});assert.equal(result.code,0);assert.deepEqual(JSON.parse(result.stdout).rows.map(r=>r.id),['amber','teal','violet']);
  const missing=await run({});assert.equal(missing.code,1);assert.equal(missing.stdout,'');assert.equal(missing.stderr.trim().split('\n').length,1);assert.doesNotMatch(missing.stderr,/at |file:\/\//);
 }finally{await f.close();}
});
test('view requests have a separate quota from pending mutation requests',async()=>{
 const f=await fixture();const sockets=[];
 try{
  const c=await f.identity('amber'),u=new URL(c.url);
  for(let i=0;i<4;i++)await new Promise(resolve=>{const s=net.connect(+u.port,u.hostname,()=>{s.write(`POST /call HTTP/1.1\r\nHost: ${u.host}\r\nAuthorization: Bearer ${c.token}\r\nContent-Length: 100\r\n\r\n`);resolve();});s.on('error',()=>{});sockets.push(s);});
  await new Promise(r=>setTimeout(r,20));
  assert.equal((await f.request('amber',{view:'status'})).status,200);
  const blocked=await fetch(c.url+'/call',{method:'POST',headers:{authorization:`Bearer ${c.token}`},body:'{}'});assert.equal(blocked.status,429);
 }finally{for(const s of sockets)s.destroy();await f.close();}
});
test('hub retains a private current-run pointer and deadline metadata without changing journals on reads',async()=>{
 const f=await fixture({live:{budgetMs:120000,stepTicks:1}});
 try{
  const pointerPath=join(f.root,'current-run.json'),before=await readFile(pointerPath,'utf8'),pointer=JSON.parse(before);
  assert.equal(pointer.run,'run-0001');assert.equal(pointer.closed,false);assert.equal(pointer.live.stepTicks,1);assert.ok(pointer.live.deadlineAt>Date.now());
  const read=await f.request('amber',{view:'status'});assert.equal(read.body.whoami.robotId,'amber');assert.equal(read.body.whoami.role,'robot');assert.ok(read.body.live.remainingMs>0);
  assert.equal(await readFile(pointerPath,'utf8'),before);
  await f.hub.close();assert.equal(JSON.parse(await readFile(pointerPath,'utf8')).closed,true);
 }finally{await f.close();}
});
