import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {capture} from '../tools/capture.mjs';
import {runDemo} from '../tools/demo.mjs';
import {startHub} from '../src/hub.mjs';
import {McpClient} from '../tools/mcp-client.mjs';
const root=resolve(new URL('../',import.meta.url).pathname);
const cli=(entry,args=[],env={})=>spawnSync(process.execPath,[join(root,entry),...args],{cwd:root,env:{...process.env,...env},encoding:'utf8',timeout:15000});
function refused(result,pattern){assert.equal(result.status,1,result.stderr);assert.equal(result.stdout,'');assert.match(result.stderr,pattern);assert.equal(result.stderr.trim().split('\n').length,1,result.stderr);assert.doesNotMatch(result.stderr,/node:internal|\bat .*\.m?js:/);}
test('configuration generation refuses relative, tilde, empty, missing and directory paths; all clients preserve an existing absolute quoted path',async()=>{
 const temp=await mkdtemp(join(tmpdir(),"sim config 'quoted' "));
 try{
  const file=join(temp,'connection-amber.json');await writeFile(file,'{}',{mode:0o600});
  for(const client of ['claude','codex','cursor','claude-desktop','deepseek']){
   refused(cli('tools/mcp-config.mjs',['--client',client,'--connection',relative(root,file)]),/absolute path/);
   for(const value of ['relative','~/private','~','','C:folder'])refused(cli('tools/mcp-config.mjs',['--client',client,'--connection',value]),/absolute path/);
   refused(cli('tools/mcp-config.mjs',['--client',client,'--connection',join(temp,'missing.json')]),/ENOENT/);
   refused(cli('tools/mcp-config.mjs',['--client',client,'--connection',temp]),/existing file/);
   const valid=cli('tools/mcp-config.mjs',['--client',client,'--connection',file]);assert.equal(valid.status,0,valid.stderr);assert.equal(valid.stderr,'');assert.ok(valid.stdout.includes(JSON.stringify(file)),valid.stdout);
  }
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('capture and artifact verification report one-line usage and missing-file errors, including bare valued options',()=>{
 refused(cli('tools/capture.mjs'),/^Usage: node tools\/capture\.mjs/);
 for(const option of ['--run','--output','--seconds','--cameras','--verify-against']){
  const args=['--run','missing','--output','new'].filter((_,i,a)=>!(a[i]===option||a[i-1]===option));
  refused(cli('tools/capture.mjs',[...args,option]),new RegExp(option+' requires a value'));
 }
 refused(cli('tools/verify-artifacts.mjs'),/^Usage: node tools\/verify-artifacts\.mjs/);
 refused(cli('tools/verify-artifacts.mjs',['missing-artifacts']),/ENOENT/);
});
test('a failed capture removes its own new output and preserves a pre-existing directory',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'sim-capture-failure-'));
 try{
  const run=join(temp,'run'),output=join(temp,'frames'),missing=join(temp,'no-browser');await runDemo({output:run});
  refused(cli('tools/capture.mjs',['--run',run,'--output',output,'--seconds','0.1'],{SIM_CHROMIUM_EXECUTABLE:missing}),/^Offline Chromium missing\./);
  await assert.rejects(stat(output),{code:'ENOENT'});
  await mkdir(output);const marker=join(output,'keep.txt');await writeFile(marker,'retained');
  refused(cli('tools/capture.mjs',['--run',run,'--output',output,'--seconds','0.1'],{SIM_CHROMIUM_EXECUTABLE:missing}),/EEXIST/);
  assert.equal(await readFile(marker,'utf8'),'retained');
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('unbound offline events explain empty visibility in manual and live runs, preserving private action filtering and shared commits',async()=>{
 for(const live of [false,true]){
  const temp=await mkdtemp(join(tmpdir(),'sim-empty-events-'));let hub,c;
  try{
   hub=await startHub({root:temp,...(live?{live:{budgetMs:120000}}:{})});c=new McpClient(hub.connections.amber);await c.initialize();
   const args={robotId:'amber',v:0,w:0,duration:1,...(live?{round:(await c.call('sim.status',{})).live.round}:{})};await c.call('robot.drive',args);await c.close();c=null;await hub.close();
   const argsView=['events','--root',temp,'--run','run-0001'];const empty=cli('tools/sim-view.mjs',argsView,{SIM_CONNECTION:'',SIM_RUN_ROOT:''});assert.equal(empty.status,0,empty.stderr);assert.match(empty.stdout,/No events.*unbound offline observer/);assert.match(empty.stdout,/SIM_CONNECTION/);assert.doesNotMatch(empty.stdout,/script-amber|script-task|script-ledger|robot.drive/);
   const json=cli('tools/sim-view.mjs',[...argsView,'--json'],{SIM_CONNECTION:'',SIM_RUN_ROOT:''});assert.equal(JSON.parse(json.stdout).rows.length,0);
   if(live){await writeFile(join(temp,'run-0001','live.jsonl'),JSON.stringify({kind:'commit',caller:{role:'launcher',agentId:'sim-launcher'},robotId:null,round:'1:0',reason:'deadline'})+'\n');const visible=cli('tools/sim-view.mjs',argsView,{SIM_CONNECTION:'',SIM_RUN_ROOT:''});assert.equal(visible.status,0,visible.stderr);assert.match(visible.stdout,/commit/);assert.doesNotMatch(visible.stdout,/No events.*unbound/);}
  }finally{await c?.close();await hub?.close();await rm(temp,{recursive:true,force:true});}
 }
});
test('sim.status names only the caller’s own bound identity, never its capability, in manual and live mode',async()=>{
 for(const live of [false,true]){
  const temp=await mkdtemp(join(tmpdir(),'sim-whoami-'));let hub;const clients=[];
  try{
   hub=await startHub({root:temp,...(live?{live:{budgetMs:120000}}:{})});
   for(const [id,file] of Object.entries(hub.connections)){
    const config=JSON.parse(await readFile(file,'utf8')),c=new McpClient(file);clients.push(c);await c.initialize();const status=await c.call('sim.status',{});
    assert.deepEqual(status.whoami,{role:config.role,agentId:config.agentId,...(config.role==='robot'?{robotId:config.robotId}:{})});
    assert.equal(id==='coordinator'?status.whoami.role:status.whoami.robotId,id==='coordinator'?'coordinator':id);assert.equal('live' in status,live);
    assert.ok(!JSON.stringify(status).includes(config.token));assert.ok(!JSON.stringify(status).includes(config.url));
   }
  }finally{for(const c of clients)await c.close();await hub?.close();await rm(temp,{recursive:true,force:true});}
 }
});
test('both marketplace entries resolve to the shipped plugin root with matching identities and release versions',async()=>{
 const pkg=JSON.parse(await readFile(join(root,'package.json')));
 for(const [catalog,manifest] of [['.claude-plugin/marketplace.json','.claude-plugin/plugin.json'],['.agents/plugins/marketplace.json','.codex-plugin/plugin.json']]){
  const data=JSON.parse(await readFile(join(root,catalog))),entry=data.plugins.find(p=>p.name===pkg.name);assert.ok(entry);assert.equal(data.name,pkg.name);
  const source=typeof entry.source==='string'?entry.source:entry.source.path,pluginRoot=resolve(root,source);assert.equal(pluginRoot,root);const plugin=JSON.parse(await readFile(join(pluginRoot,manifest)));assert.equal(plugin.name,entry.name);assert.equal(plugin.version,pkg.version);assert.ok((await stat(join(pluginRoot,'src/mcp.mjs'))).isFile());
  if(typeof entry.source==='object'){assert.equal(entry.source.source,'local');assert.equal(entry.policy.installation,'AVAILABLE');assert.ok(['ON_INSTALL','ON_USE'].includes(entry.policy.authentication));assert.ok(entry.category);}
 }
});
