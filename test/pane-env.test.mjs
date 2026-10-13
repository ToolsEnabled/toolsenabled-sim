import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readerCommand} from '../hooks/view.mjs';

test('pane reader and action preflight exec with only their allowlisted environment',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sim-pane-env-'));
 try{
  await writeFile(join(root,'probe.mjs'),'console.log(JSON.stringify(Object.keys(process.env).sort()))');
  const inherited={PATH:'/usr/local/bin:/usr/bin:/bin',ANTHROPIC_API_KEY:'synthetic',CLAUDE_CODE_MESSAGING_TOKEN:'synthetic',CLAUDE_CODE_MESSAGING_SOCKET:'synthetic',SIM_ENV_CANARY:'synthetic',HOME:root};
  const negative=spawnSync(process.execPath,[join(root,'probe.mjs')],{env:inherited,encoding:'utf8'});
  assert.equal(negative.status,0);assert.ok(JSON.parse(negative.stdout).includes('ANTHROPIC_API_KEY'));
  for(const mode of ['connection','action']){
   const argv=readerCommand(root,mode,'/synthetic/connection','/synthetic/root',inherited.PATH);
   // Run the exact launch prefix with a names-only child in place of the reader payload.
   const nodeIndex=argv.indexOf('node');assert.ok(nodeIndex>1);const command=[...argv.slice(0,nodeIndex),process.execPath,join(root,'probe.mjs')];
   const child=spawnSync(command[0],command.slice(1),{env:inherited,encoding:'utf8'});
   assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout),['LANG','PATH','SIM_CONNECTION','SIM_RUN_ROOT']);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
