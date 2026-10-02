import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
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
