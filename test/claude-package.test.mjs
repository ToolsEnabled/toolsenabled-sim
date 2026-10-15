import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {startHub} from '../src/hub.mjs';
import {McpClient} from '../tools/mcp-client.mjs';

const root=resolve(new URL('../',import.meta.url).pathname);
const json=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
test('Claude and Desktop use one absolute connection-file option in env; Codex uses its own inline server',async()=>{
 const plugin=await json('.claude-plugin/plugin.json'),desktop=await json('manifest.json'),claude=await json('.mcp.json'),codex=await json('.codex-plugin/plugin.json');
 assert.equal(plugin.name,'toolsenabled-sim');assert.equal(desktop.name,plugin.name);assert.equal(codex.name,plugin.name);
 for(const metadata of [plugin,desktop]){assert.equal(metadata.version,'0.1.13');assert.match((metadata.userConfig||metadata.user_config).connection_file.description,/^Absolute path/);
  // fresh-user-7 Sim #4: the title said "robot" while the README's Try it installs the coordinator's file.
  assert.equal((metadata.userConfig||metadata.user_config).connection_file.title,'Connection file (robot or coordinator)');}
 assert.deepEqual(claude.mcpServers.toolsenabled_sim,{command:'node',args:['${CLAUDE_PLUGIN_ROOT}/src/mcp.mjs'],env:{SIM_CONNECTION:'${user_config.connection_file}'}});
 assert.deepEqual(desktop.server.mcp_config,{command:'node',args:['${__dirname}/src/mcp.mjs'],env:{SIM_CONNECTION:'${user_config.connection_file}'}});
 assert.deepEqual(codex.mcpServers,{toolsenabled_sim:{command:'node',args:['./src/mcp.mjs'],cwd:'./',env_vars:['SIM_CONNECTION']}});
 // Codex reads hooks/hooks.json (the Claude Code /sim mod) unless its manifest declares hooks; the empty object turns that off.
 assert.deepEqual(codex.hooks,{});assert.equal(codex.interface.developerName,'ToolsEnabled, Inc.');assert.ok(codex.interface.shortDescription.length<=30);
 assert.deepEqual([codex.interface.websiteURL,codex.interface.supportURL,codex.interface.privacyPolicyURL,codex.interface.termsOfServiceURL],['https://toolsenabled.ai/sim/','https://toolsenabled.ai/support/','https://toolsenabled.ai/privacy/',undefined]);
 assert.ok(!(await readdir(root)).includes('server.json'));
});
// fresh-user-6 Sim #6: after a clean hub shutdown the shim said only "Invalid SIM_CONNECTION file."; a stopped hub removes its connection
// files, and the plugin has to be pointed at the new one, so the shim says so. Every other refusal keeps its one-line message.
test('after the hub stops, the MCP shim names the missing connection file and says to start the hub again',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'sim-stopped-hub-'));
 try{
  const hub=await startHub({root:temp}),file=hub.connections.coordinator;await hub.close();
  const input=JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})+'\n';
  const gone=spawnSync(process.execPath,[join(root,'src/mcp.mjs')],{env:{...process.env,SIM_CONNECTION:file},input,encoding:'utf8',timeout:5000});
  assert.equal(gone.status,1);assert.equal(gone.stdout,'');assert.equal(gone.stderr.trim().split('\n').length,1,gone.stderr);
  assert.match(gone.stderr,/^SIM_CONNECTION file not found: /);assert.ok(gone.stderr.includes(file),gone.stderr);// fresh-user-7 Sim #5: a restart with the same --root writes the same file again, so the advice says when to reconfigure.
  assert.ok(gone.stderr.endsWith(`${file}. A hub removes its connection files when it stops, so start it again. With the same --root it writes this same file again and nothing needs reconfiguring; with a new --root, configure this plugin with the new connection file it prints.\n`),gone.stderr);
  const again=await startHub({root:temp});try{assert.equal(again.connections.coordinator,file);}finally{await again.close();}
  const missingRoot=spawnSync(process.execPath,[join(root,'src/mcp.mjs')],{env:{...process.env,SIM_CONNECTION:join(temp,'gone','connection-amber.json')},input,encoding:'utf8',timeout:5000});
  assert.equal(missingRoot.status,1);assert.match(missingRoot.stderr,/^SIM_CONNECTION file not found: .*start it again\. With the same --root/);
  const {writeFile,mkdir}=await import('node:fs/promises');await mkdir(join(temp,'bad'),{mode:0o700});await writeFile(join(temp,'bad','connection.json'),'not json',{mode:0o600});
  const invalid=spawnSync(process.execPath,[join(root,'src/mcp.mjs')],{env:{...process.env,SIM_CONNECTION:join(temp,'bad','connection.json')},input,encoding:'utf8',timeout:5000});
  assert.equal(invalid.status,1);assert.equal(invalid.stderr,'Invalid SIM_CONNECTION file.\n');
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('SIM_CONNECTION rejects relative, tilde, empty and drive-relative paths before reading; absolute paths with spaces work',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'sim paths '));let hub;
 try{
  hub=await startHub({root:temp});
  const input=JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})+'\n';
  for(const value of ['connection-amber.json','~/folder','~','','C:folder']){
   const result=spawnSync(process.execPath,[join(root,'src/mcp.mjs')],{cwd:temp,env:{...process.env,SIM_CONNECTION:value},input,encoding:'utf8',timeout:5000});
   assert.equal(result.status,1,value);assert.match(result.stderr,/absolute path/i,value);assert.equal(result.stdout,'');
  }
  const absent=spawnSync(process.execPath,[join(root,'src/mcp.mjs')],{cwd:temp,env:{},input,encoding:'utf8',timeout:5000});
  assert.equal(absent.status,1);assert.match(absent.stderr,/absolute path/i);assert.equal(absent.stdout,'');
  const c=new McpClient(hub.connections.amber);try{assert.equal((await c.initialize()).serverInfo.name,'toolsenabled-sim');assert.equal((await c.call('sim.status',{})).tick,0);}finally{await c.close();}
 }finally{await hub?.close();await rm(temp,{recursive:true,force:true});}
});
test('actual initialize instructions and skill agree on clock, identity, delivery and local-only human tools',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'sim-instructions-'));let hub,c;
 const contract=text=>{
  assert.match(text,/sim\.status/);assert.match(text,/robot\.submit/);assert.match(text,/sim\.step/);assert.match(text,/width\/2 - 0\.3/);assert.match(text,/depth\/2 - 0\.3/);
  assert.match(text,/coordinator cannot.*live.*robot/i);assert.match(text,/capture.*replay.*human.*local/i);assert.match(text,/no.*dashboard/i);assert.match(text,/never.*connection files/i);
 };
 try{hub=await startHub({root:temp});c=new McpClient(hub.connections.amber);const response=await c.initialize(),skill=await readFile(join(root,'skills/toolsenabled-sim/SKILL.md'),'utf8');contract(response.instructions);contract(skill);
  assert.throws(()=>contract(response.instructions.replace(/The coordinator cannot[^.]+\./,'The coordinator may drive live robots.')));
  assert.throws(()=>contract(response.instructions.replace(/Capture[^.]+\./,'Capture and publish through MCP.')));
  const tools=(await c.request('tools/list',{})).tools;assert.equal(tools.length,6);assert.ok(!tools.some(t=>/capture|publish|reissue|export/.test(t.name)));
 }finally{await c?.close();await hub?.close();await rm(temp,{recursive:true,force:true});}
});
