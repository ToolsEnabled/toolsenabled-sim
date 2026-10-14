import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import * as view from '../hooks/view.mjs';
// Moved unchanged from test/guards.test.mjs in 0.1.12. These tests start readers with mkfifo and node -e, so they live in a
// file that makes no HTTP request of its own (the portal reads the two together as a download-and-run pattern).
const cli=resolve('tools/sim-view.mjs');
// 0.1.8 product review, Sim #3: opening a FIFO read-only blocked before the regular-file check could refuse it. Each
// reader runs in a child with a deadline, because before the fix the open itself blocked until the child was killed.
const settled=(result,label)=>{assert.equal(result.error,undefined,label);assert.equal(result.signal,null,`${label} blocked on the FIFO`);};
async function withFifo(fn){
 const root=await mkdtemp(join(tmpdir(),'sim-fifo-'));
 try{const fifo=join(root,'connection-amber.json');const made=spawnSync('mkfifo',['-m','600',fifo],{encoding:'utf8'});assert.equal(made.status,0,made.stderr);await fn(fifo);}
 finally{await rm(root,{recursive:true,force:true});}
}
for(const [module,name,message] of [['../src/private-files.mjs','readConnection',/^Connection file must be owned by this user with mode 0600$/],['../src/view-files.mjs','file',/^Private run file is unavailable\.$/],['../src/view-client.mjs','readScenario',/^Scenario must be an owned, non-writable regular file below 256 KiB\.$/]])test(`${name} refuses a FIFO at once instead of blocking`,()=>withFifo(fifo=>{
 const code=`import {${name}} from ${JSON.stringify(new URL(module,import.meta.url).href)};try{${name}(process.argv[1]);console.log('opened');}catch(e){console.log(e.message);}`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code,'--',fifo],{env:{},encoding:'utf8',timeout:5000});
 settled(result,name);assert.equal(result.status,0,result.stderr);assert.match(result.stdout.trim(),message);
}));
test('the MCP shim refuses a FIFO as SIM_CONNECTION with its one-line error instead of hanging',()=>withFifo(fifo=>{
 const shim=spawnSync(process.execPath,[resolve('src/mcp.mjs')],{env:{SIM_CONNECTION:fifo},input:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})+'\n',encoding:'utf8',timeout:5000});
 settled(shim,'mcp.mjs');assert.equal(shim.status,1);assert.equal(shim.stderr,'Invalid SIM_CONNECTION file.\n');assert.equal(shim.stdout,'');
}));
test('sim-view, which the pane and action preflight run, refuses a FIFO connection at once',()=>withFifo(fifo=>{
 const view=spawnSync(process.execPath,[cli,'status'],{env:{SIM_CONNECTION:fifo},encoding:'utf8',timeout:5000});
 settled(view,'sim-view');assert.equal(view.status,1);assert.match(view.stderr,/configured private Sim connection is unavailable/);
 const action=spawnSync(process.execPath,[cli,'action'],{env:{SIM_CONNECTION:fifo},input:JSON.stringify({verb:'step',args:[]}),encoding:'utf8',timeout:5000});
 settled(action,'sim-view action');assert.equal(action.status,0,action.stderr);assert.equal(JSON.parse(action.stdout).allowed,false);
}));
// 0.1.12: the mod now runs the reader as sim-view.mjs --pane with the configured paths on standard input; it refuses a FIFO
// connection at once there too.
test('sim-view --pane, the reader command the mod runs, refuses a FIFO connection at once',()=>withFifo(fifo=>{
 const pane=spawnSync(process.execPath,[cli,'--pane'],{env:{},input:view.readerRequest('status',fifo,'',{}),encoding:'utf8',timeout:5000});
 settled(pane,'sim-view --pane');assert.equal(pane.status,1);assert.match(pane.stderr,/configured private Sim connection is unavailable/);
 const action=spawnSync(process.execPath,[cli,'--pane'],{env:{},input:view.readerRequest('action',fifo,'',{},{verb:'step',args:[]}),encoding:'utf8',timeout:5000});
 settled(action,'sim-view --pane action');assert.equal(action.status,0,action.stderr);assert.equal(JSON.parse(action.stdout).allowed,false);
}));
