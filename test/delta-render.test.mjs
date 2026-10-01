import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,mkdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {capture} from '../tools/capture.mjs';
test('N-4: the replay server and headless capture accept a historical v1 free-text run',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sim-v1-render-'));try{const run=join(root,'run');await mkdir(run,{mode:0o700});await copyFile(new URL('./fixtures/v1-free-text-trajectory.jsonl',import.meta.url),join(run,'trajectory.jsonl'));const result=await capture({run,output:join(root,'frames'),times:[0],cameras:'multiview'});assert.equal(result.networkExternal,0);const png=await readFile(join(root,'frames/multiview/000000.png'));assert.equal(png.readUInt32BE(16),1080);assert.equal(png[25],2);}finally{await rm(root,{recursive:true,force:true});}
});
