import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn,execFileSync} from 'node:child_process';
import {startHub} from '../src/hub.mjs';import {toolList} from '../src/schema.mjs';import {McpClient} from '../tools/mcp-client.mjs';
const neverTools=['capture','record','upload','publish','exec','shell','pause','resume','undo','redo','export'];
test('no capture/upload/human dashboard action exists on either MCP surface',()=>{
 for(const role of ['robot','coordinator','human'])for(const tool of toolList(role))assert.ok(!neverTools.some(w=>tool.name.includes(w)),tool.name);
});
test('capabilities protect even correct local Origin+JSON; capture routes absent for all clients; root has one writer',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sim-security-'));let hub;const clients=[];
 try{
  hub=await startHub({root});await assert.rejects(startHub({root}),/EEXIST/);
  const c=new McpClient(hub.connections.coordinator);clients.push(c);await c.initialize();
  const cfg=JSON.parse(await readFile(hub.connections.coordinator,'utf8'));
  const body=JSON.stringify({method:'tools/call',params:{name:'sim.reset',arguments:{}}});
  const res=await fetch(hub.url+'/call',{method:'POST',headers:{origin:hub.url,'content-type':'application/json'},body});assert.equal(res.status,403);
  const noCapability=await fetch(hub.url+'/call',{method:'POST',headers:{'content-type':'application/json'},body});assert.equal(noCapability.status,401);
  const forged=await fetch(hub.url+'/call',{method:'POST',headers:{authorization:'Bearer '+'0'.repeat(64),'content-type':'application/json'},body});assert.equal(forged.status,401);
  for(const path of ['/capture','/capture/start','/upload','/publish']){const blocked=await fetch(hub.url+path,{method:'POST',headers:{authorization:`Bearer ${cfg.token}`,'content-type':'application/json'},body:'{}'});assert.equal(blocked.status,404);}
  for(const tool of ['sim.capture','capture.start','sim.upload'])await assert.rejects(c.call(tool,{}),/Unknown tool/);
  const malformed=await fetch(hub.url+'/call',{method:'POST',headers:{authorization:`Bearer ${cfg.token}`},body:'{'});assert.equal(malformed.status,400);
  const old=await readFile(join(root,'run-0001','trajectory.jsonl'));
  await assert.rejects(c.call('sim.scenario',{scenario:{},assignments:[]}),/missing/);assert.deepEqual(await readFile(join(root,'run-0001','trajectory.jsonl')),old);
  const replies=await Promise.all(Array.from({length:10},()=>c.call('sim.step',{n:1})));assert.deepEqual(replies.map(r=>r.tick),[1,2,3,4,5,6,7,8,9,10]);
 }finally{for(const c of clients)await c.close();if(hub)await hub.close();await rm(root,{recursive:true,force:true});}
});
test('stdio malformed, pre-initialize, oversized and truncated frames are bounded protocol errors',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sim-framing-'));const hub=await startHub({root});
 try{
  for(const [input,code] of [['bad\n',-32700],[JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})+'\n',-32002],['x'.repeat(262145),-32600],['{',-32700]]){
   const child=spawn(process.execPath,['src/mcp.mjs'],{env:{...process.env,SIM_CONNECTION:hub.connections.amber},stdio:['pipe','pipe','pipe']});
   let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.stdin.on('error',()=>{});
   child.stdin.end(input);const timer=setTimeout(()=>child.kill('SIGKILL'),5000);const exit=await new Promise(r=>child.on('exit',(code,signal)=>r({code,signal})));clearTimeout(timer);
   assert.equal(exit.signal,null);assert.equal(exit.code,0,err);assert.equal(JSON.parse(out.trim()).error.code,code);
  }
 }finally{await hub.close();await rm(root,{recursive:true,force:true});}
});
test('all five configuration formats use explicit absolute executable, entry and private connection',()=>{
 for(const client of ['claude','codex','cursor','claude-desktop','deepseek']){
  const out=execFileSync(process.execPath,['tools/mcp-config.mjs','--client',client,'--connection','runs/hub/connection-amber.json'],{encoding:'utf8'});
  if(client==='codex'){assert.ok(out.startsWith('[mcp_servers.toolsenabled_sim]'));assert.ok(out.includes('SIM_CONNECTION = '));}else if(client==='deepseek'){assert.match(out,/^- insert:/);assert.match(out,/@deepseek-ai\/dsh-mcp-client/);assert.ok(out.includes(JSON.stringify(process.execPath)));}else{const c=JSON.parse(out).mcpServers.toolsenabled_sim;assert.equal(c.command,process.execPath);assert.equal(c.args.length,1);assert.ok(c.env.SIM_CONNECTION.endsWith('/runs/hub/connection-amber.json'));}
 }
});
test('stdio request queue rejects bursts above its bounded capacity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sim-queue-'));const hub=await startHub({root});const c=new McpClient(hub.connections.amber);
 try{await c.initialize();const results=await Promise.allSettled(Array.from({length:100},()=>c.request('tools/list',{})));assert.ok(results.some(r=>r.status==='rejected'&&/pending/.test(r.reason.message)));assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal((await c.call('sim.status',{})).tick,0);}finally{await c.close();await hub.close();await rm(root,{recursive:true,force:true});}
});
