import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {defaultScenario,defaultAssignments} from '../src/hub.mjs';
// Moved unchanged from test/review.test.mjs in 0.1.12. This test runs the launcher's printed registration lines in bash, so it
// lives in a file that makes no HTTP request of its own (the portal reads the two together as a download-and-run pattern).
test('I-5: default launcher output contains directly executable POSIX registration lines',async()=>{
 const {execFileSync}=await import('node:child_process');const root=await mkdtemp(join(tmpdir(),"sim print ' "));let child;
 try{const work=join(root,'work.json');await writeFile(work,JSON.stringify({assignments:defaultAssignments(defaultScenario()).map(a=>({...a,driverLabel:'SCRIPT'}))}));child=spawn(process.execPath,['tools/live.mjs','--root',join(root,'hub'),'--work-record',work],{stdio:['ignore','pipe','pipe']});let output='',stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.on('data',b=>output+=b);const ended=new Promise(r=>child.on('close',code=>r(code)));await new Promise((r,j)=>{const t=setTimeout(()=>j(new Error(stderr)),5000);const ready=()=>{if(output.endsWith('\n')&&output.split('\n').filter(line=>/^(claude|codex) mcp /.test(line)).length===8){clearTimeout(t);child.stdout.off('data',ready);r();}};child.stdout.on('data',ready);});child.kill('SIGTERM');assert.equal(await ended,0,stderr);
  const lines=output.split('\n').filter(line=>/^(claude|codex) mcp /.test(line));assert.equal(lines.length,8,output);assert.match(output,/role=robot agentId=script-amber robotId=amber/);
  for(const line of lines){const host=line.split(' ')[0],args=execFileSync('bash',['-c',`${host}(){ printf '%s\\0' "$@"; }\n${line}`],{encoding:'utf8'}).split('\0').slice(0,-1);assert.equal(args[0],'mcp');if(host==='claude')assert.ok(JSON.parse(args.at(-1)).env.SIM_CONNECTION.startsWith(root));else assert.ok(args[4].startsWith('SIM_CONNECTION='+root));}
 }finally{child?.kill('SIGKILL');await rm(root,{recursive:true,force:true});}
});
