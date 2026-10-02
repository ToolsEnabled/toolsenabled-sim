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
 for(const metadata of [plugin,desktop]){assert.equal(metadata.version,'0.1.2');assert.match((metadata.userConfig||metadata.user_config).connection_file.description,/^Absolute path/);}
 assert.deepEqual(claude.mcpServers.toolsenabled_sim,{command:'node',args:['${CLAUDE_PLUGIN_ROOT}/src/mcp.mjs'],env:{SIM_CONNECTION:'${user_config.connection_file}'}});
 assert.deepEqual(desktop.server.mcp_config,{command:'node',args:['${__dirname}/src/mcp.mjs'],env:{SIM_CONNECTION:'${user_config.connection_file}'}});
 assert.deepEqual(codex.mcpServers,{toolsenabled_sim:{command:'node',args:['./src/mcp.mjs'],cwd:'./',env_vars:['SIM_CONNECTION']}});
 assert.ok(!(await readdir(root)).includes('server.json'));
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
