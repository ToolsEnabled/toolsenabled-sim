import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {defaultScenario,defaultAssignments} from '../src/hub.mjs';
const root=new URL('../',import.meta.url).pathname;
test('hub and live refuse relative, tilde, empty and drive-relative input paths before creating state',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'sim-cli paths '));
 try{
  const scene=join(temp,'scene.json'),work=join(temp,'work.json');
  await writeFile(scene,JSON.stringify(defaultScenario()));await writeFile(work,JSON.stringify({assignments:defaultAssignments(defaultScenario()).map(a=>({...a,driverLabel:'SCRIPT'}))}));
  for(const entry of ['src/hub-cli.mjs','tools/live.mjs'])for(const option of ['--root','--work-record','--scenario'])for(const value of ['relative','~/folder','~','','C:folder']){
   const args={'--root':join(temp,'hub'),'--work-record':work,'--scenario':scene};args[option]=value;
   const result=spawnSync(process.execPath,[join(root,entry),...Object.entries(args).flat()],{cwd:temp,encoding:'utf8',timeout:1500});
   assert.equal(result.status,1,`${entry} ${option} ${value}: ${result.stderr}`);assert.match(result.stderr,/absolute path/i);assert.equal(result.stdout,'');assert.equal(result.stderr.trim().split('\n').length,1,result.stderr);assert.doesNotMatch(result.stderr,/\bat .*\.mjs:/);
  }
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('demo, replay and configuration helpers report usage, engine and file errors on one line without stack traces',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'sim-cli-errors-'));
 try{
  const run=(entry,...args)=>spawnSync(process.execPath,[join(root,entry),...args],{cwd:temp,encoding:'utf8',timeout:15000});
  const oneLine=(result,pattern,label)=>{assert.equal(result.status,1,`${label}: ${result.stderr}`);assert.equal(result.stdout,'',label);assert.equal(result.stderr.trim().split('\n').length,1,`${label}: ${result.stderr}`);assert.match(result.stderr.trim(),pattern,label);assert.doesNotMatch(result.stderr,/\bat .*\.m?js:|node:internal/,label);};
  oneLine(run('tools/demo.mjs'),/^Usage: node tools\/demo\.mjs/,'demo usage');
  oneLine(run('tools/demo.mjs','--output',join(temp,'refused'),'--engine','bullet'),/^Unknown physics engine: use rapier or mujoco$/,'demo engine');assert.deepEqual(await readdir(temp),[]);
  await mkdir(join(temp,'taken'));oneLine(run('tools/demo.mjs','--output',join(temp,'taken')),/^Demo output directory must be new: /,'demo existing');
  oneLine(run('tools/demo.mjs','--output'),/^--output requires a value$/,'demo bare output');oneLine(run('tools/demo.mjs','--output',join(temp,'bare-work'),'--work-record'),/^--work-record requires a value$/,'demo bare work record');assert.deepEqual(await readdir(temp),['taken']);
  oneLine(run('tools/mcp-config.mjs'),/^Usage: node tools\/mcp-config\.mjs/,'config usage');oneLine(run('tools/mcp-config.mjs','--client'),/^--client requires a value$/,'config bare client');
  // fresh-user-6 Sim #4: a wrong path printed a raw ENOENT. Replay names what it needs: a run directory with trajectory.jsonl.
  oneLine(run('tools/replay.mjs',join(temp,'missing')),/^Replay needs a run directory containing trajectory\.jsonl and actions\.jsonl, such as \.\/runs\/demo or a hub's run-NNNN folder: .*\/missing\/trajectory\.jsonl does not exist$/,'replay missing');
  await mkdir(join(temp,'runs'));await mkdir(join(temp,'runs','demo'));oneLine(run('tools/replay.mjs',join(temp,'runs')),/^Replay needs a run directory .*\/runs\/trajectory\.jsonl does not exist$/,'replay parent of a run');assert.doesNotMatch(run('tools/replay.mjs',join(temp,'runs')).stderr,/ENOENT/);
 }finally{await rm(temp,{recursive:true,force:true});}
});
