import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {startHub} from '../src/hub.mjs';
import {offlineChromium} from '../tools/capture.mjs';
import {McpClient} from '../tools/mcp-client.mjs';
// Moved unchanged from test/audit-views.test.mjs in 0.1.9. This test runs the printed command in a POSIX shell, so it lives
// in a file that makes no HTTP request of its own: it records ticks through the plugin's MCP server (tools/mcp-client.mjs).
const cli=resolve('tools/sim-view.mjs');
const run=(args,env={},input='')=>new Promise(resolve=>{const p=spawn(process.execPath,[cli,...args,'--json'],{env,stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('close',code=>{let body;try{body=JSON.parse(out);}catch{}resolve({code,body,out,err});});p.stdin.end(input);});
const step=async(hub,n)=>{const c=new McpClient(hub.connections.coordinator);try{await c.initialize();return await c.call('sim.step',{n});}finally{await c.close();}};
async function setup(live=false){const root=await mkdtemp(join(tmpdir(),'sim-audit-view-'));const hub=await startHub({root,...(live?{live:{budgetMs:120000}}:{})});return {root,hub,env:role=>({SIM_CONNECTION:hub.connections[role],SIM_RUN_ROOT:root}),async close(){await hub.close();await rm(root,{recursive:true,force:true});}};}
// 0.1.8 product review, Sim #2: the printed capture command had no --seconds, so capture's 10 s default failed for
// every run under 598 ticks (and every just-reset run) and covered only the first 10 s of longer runs.
test('replay prints a capture command that covers the whole recorded run and works exactly as printed',async()=>{
 const chromium=await offlineChromium();
 const f=await setup();const out=await mkdtemp(join(tmpdir(),'sim-replay-capture-'));
 try{
  assert.equal((await step(f.hub,6)).tick,6);
  const online=await run(['replay'],f.env('coordinator'));assert.equal(online.code,0,online.err);
  const printed=online.body.rows[0].lines.find(s=>s.includes('tools/capture.mjs'));assert.ok(printed);
  assert.match(printed,/ --seconds 0\.1$/);
  await f.hub.close();
  const offline=await run(['replay','--root',f.root]);assert.equal(offline.code,0,offline.err);assert.equal(offline.body.rows[0].lines.find(s=>s.includes('tools/capture.mjs')),printed);
  // Run it as printed, in a POSIX shell, with only the chosen new output directory filled in.
  const frames=join(out,'frames'),command=printed.replace("'<new-absolute-directory>'","'"+frames.replaceAll("'","'\\''")+"'");
  const result=spawnSync('/bin/sh',['-c',command],{env:{PATH:dirname(process.execPath),SIM_CHROMIUM_EXECUTABLE:chromium,...(process.env.TMPDIR?{TMPDIR:process.env.TMPDIR}:{})},encoding:'utf8',timeout:120000});
  assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(await readFile(join(frames,'capture-receipt.json'),'utf8'));
  assert.deepEqual(receipt.cameras,['overview']);assert.equal(receipt.framesPerCamera,3);
  assert.ok(receipt.times.at(-1)<=6/60&&receipt.times.at(-1)>=3/60,`frames cover the whole 6-tick run: ${receipt.times}`);
 }finally{await f.close();await rm(out,{recursive:true,force:true});}
});
