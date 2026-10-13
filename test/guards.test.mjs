import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,rmdir,symlink,chmod,truncate} from 'node:fs/promises';
import {constants,writeSync,readFileSync,closeSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {startHub,defaultScenario} from '../src/hub.mjs';
import {displayText} from '../src/display.mjs';
import {row} from '../src/views.mjs';
import {file,privateJSON,ends,number,MAX_READ} from '../src/view-files.mjs';
import {readConnection} from '../src/private-files.mjs';
import {readScenario} from '../src/view-client.mjs';
import {parsePage,commandInput} from '../hooks/view.mjs';

// Guard pins from the 0.1.3 handoff-2 review (F2, F3): the sanitizer classes, every cap, the
// view's isolation from round expiry and dispatch, the reader's open flags, and the best-effort
// current-run pointer. Each test fails if its guard is narrowed, not only if it is removed.
const UNSAFE=/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const CLASSES={
 Cc:['\u0000','\u0007','\u0008','\u0009','\u000a','\u001b','\u007f','\u0085','\u009b','\u009d'],
 Cf:['­','؜','​','‌','‍','‎','‏','‪','‮','⁠','⁦','⁩','﻿','\u{e0041}'],
 Cs:['\ud800','\udbff','\udc00','\udfff'],
 Zl:[' '],
 Zp:[' '],
};
const HOSTILE='A\u0000\u0007\u001b]52;c;x\u0007B\u009b2J\u0085C‮⁦⁩D​‍‎⁠﻿­؜E  F\ud800G\udfffH\u{e0041}I';
const TRUNCATED='… [truncated]';
const escape=c=>'\\u'+c.codePointAt(0).toString(16).padStart(4,'0');
function strings(value,out=[]){if(typeof value==='string')out.push(value);else if(Array.isArray(value))for(const v of value)strings(v,out);else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){out.push(k);strings(v,out);}return out;}
const unsafe=value=>strings(value).filter(s=>UNSAFE.test(s));

async function fixture(options={}){
 const root=await mkdtemp(join(tmpdir(),'sim-guard-'));const warnings=[];const hub=await startHub({root,onWarning:m=>warnings.push(m),...options});
 const identity=async who=>JSON.parse(await readFile(hub.connections[who],'utf8'));
 const request=async(who,query={})=>{const c=await identity(who);const res=await fetch(c.url+'/view?'+new URLSearchParams(query),{headers:{authorization:`Bearer ${c.token}`}});const text=await res.text();return {status:res.status,body:JSON.parse(text),bytes:Buffer.byteLength(text)};};
 const call=async(who,name,args={})=>{const c=await identity(who);return (await fetch(c.url+'/call',{method:'POST',headers:{authorization:`Bearer ${c.token}`},body:JSON.stringify({method:'tools/call',params:{name,arguments:args}})})).json();};
 return {root,hub,warnings,identity,request,call,async close(){await hub.close();await rm(root,{recursive:true,force:true});}};
}
const cli=resolve('tools/sim-view.mjs');
const run=(args,env={},input='')=>new Promise(resolve=>{const p=spawn(process.execPath,[cli,...args],{env,stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('close',code=>resolve({code,out,err}));p.stdin.end(input);});

test('displayText escapes every Cc, Cf, Cs, Zl and Zp code point and truncates at its limit',()=>{
 for(const [name,chars] of Object.entries(CLASSES))for(const c of chars){
  const out=displayText('a'+c+'b');
  assert.equal(out,'a'+escape(c)+'b',`${name} ${escape(c)}`);assert.doesNotMatch(out,UNSAFE);
 }
 assert.equal(displayText(HOSTILE),[...HOSTILE].map(c=>UNSAFE.test(c)?escape(c):c).join(''));
 assert.equal(displayText('Zürich 界 \u{1f642} ‐'),'Zürich 界 \u{1f642} ‐');
 assert.equal(displayText(undefined),'—');assert.equal(displayText(null),'—');assert.equal(displayText(12),'12');
 assert.equal(displayText('x'.repeat(240)),'x'.repeat(240));
 assert.equal(displayText('x'.repeat(241)),'x'.repeat(240)+TRUNCATED);
 assert.equal(displayText('y'.repeat(1001),1000),'y'.repeat(1000)+TRUNCATED);
 assert.equal(displayText('y'.repeat(1001),2000),'y'.repeat(1001));
 // Escapes count toward the limit, so hostile text cannot grow past it.
 assert.equal(displayText('​'.repeat(100)).length,240+TRUNCATED.length);
});

test('hub views escape every hostile class from journals and retained headers and replace invalid UTF-8',async()=>{
 const f=await fixture();
 try{
  const line={order:0,tick:0,name:'robot.drive'+HOSTILE,caller:{role:'robot'+HOSTILE,agentId:'script-amber'+HOSTILE},robotId:'amber',round:'1:0'+HOSTILE,reason:'@@INVALID@@'+HOSTILE,args:{['task'+HOSTILE]:HOSTILE}};
  const json=Buffer.from(JSON.stringify(line)+'\n','utf8'),marker=Buffer.from('@@INVALID@@'),at=json.indexOf(marker);
  await writeFile(join(f.hub.runDir,'actions.jsonl'),Buffer.concat([json.subarray(0,at),Buffer.from([0xff,0xfe,0x41]),json.subarray(at+marker.length)]));
  const dir=join(f.root,'run-0002');await mkdir(dir,{mode:0o700});
  const header={kind:'header',version:2,scenario:{name:'warehouse'+HOSTILE},seed:'seed'+HOSTILE,engine:'engine'+HOSTILE,assignments:[]};
  const last={kind:'tick',status:{tick:0,delivered:0,total:0,collisions:0,score:0,stopReason:'stop'+HOSTILE,complete:false},hash:'hash'+HOSTILE};
  await writeFile(join(dir,'trajectory.jsonl'),JSON.stringify(header)+'\n'+JSON.stringify(last)+'\n',{mode:0o600});
  const events=await f.request('coordinator',{view:'events'});assert.equal(events.status,200);assert.equal(events.body.rows.length,1);
  const runs=await f.request('coordinator',{view:'runs'});assert.equal(runs.status,200);assert.equal(runs.body.rows.length,2);
  for(const page of [events.body,runs.body]){
   assert.deepEqual(unsafe(page),[]);
   const text=JSON.stringify(page);
   for(const c of ['\u0000','\u001b','\u0085','\u009b','‮','⁦','​','⁠','﻿','­',' ',' ','\ud800','\udfff','\u{e0041}'])assert.ok(text.includes(escape(c)),escape(c));
   assert.ok(Buffer.byteLength(text)<=65536);
  }
  assert.ok(JSON.stringify(events.body).includes('Reason: ��A'));
  const text=await run(['events'],{SIM_CONNECTION:f.hub.connections.coordinator});assert.equal(text.code,0,text.err);assert.deepEqual(unsafe(text.out.split('\n')),[]);assert.ok(text.out.includes('\\u200b'));
 }finally{await f.close();}
});

test('page limits, offsets and the 64 KiB output cap hold for every view, and each reader cap refuses oversized input',async()=>{
 const f=await fixture();
 try{
  for(const view of ['status','help','robots','map','runs','events','scenarios','replay','connection']){
   const ok=await f.request('coordinator',{view,limit:'10'});assert.equal(ok.status,200,view);assert.equal(ok.body.limit,10);
   for(const limit of ['11','0','1e1','-1'])assert.equal((await f.request('coordinator',{view,limit})).status,400,`${view} limit ${limit}`);
   if(view!=='events'){assert.equal((await f.request('coordinator',{view,offset:'4096'})).status,200,view);assert.equal((await f.request('coordinator',{view,offset:'4097'})).status,400,view);}
  }
  assert.equal(number(undefined,10,10),10);assert.equal(number('10',10,10),10);
  for(const value of ['11','-1','1.5','4097',' 1','0x1'])assert.throws(()=>number(value,10,10),/Invalid view page/,value);
  const help=await run(['help','--limit','10','--json']);assert.equal(help.code,0,help.err);assert.equal(JSON.parse(help.out).rows.length,10);
  for(const args of [['--limit','11'],['--offset','4097']]){const refused=await run(['help',...args,'--json']);assert.equal(refused.code,1);assert.equal(refused.out,'');assert.match(refused.err,/Invalid view page/);}
  // 64 KiB output cap: ten rows whose bounded fields are mostly three-byte characters exceed it.
  const cjk='界';
  const lines=Array.from({length:10},(_,i)=>JSON.stringify({order:i,tick:0,name:cjk.repeat(300),caller:{role:'robot',agentId:'script-amber'},robotId:'amber',round:cjk.repeat(2000),reason:cjk.repeat(2000),args:{task:cjk.repeat(2000)}}));
  await writeFile(join(f.hub.runDir,'actions.jsonl'),lines.join('\n')+'\n');
  const refused=await f.request('coordinator',{view:'events'});assert.equal(refused.status,400);assert.match(refused.body.error,/output limit/);
  const smaller=await f.request('coordinator',{view:'events',limit:'5'});assert.equal(smaller.status,200);assert.equal(smaller.body.rows.length,5);assert.ok(smaller.bytes>32768&&smaller.bytes<=65536,String(smaller.bytes));
  for(const r of smaller.body.rows){assert.equal(r.title.length,240+TRUNCATED.length);assert.ok(r.lines.length<=20);for(const l of r.lines)assert.ok(l.length<=1000+TRUNCATED.length);}
  // Row shape caps: 20 lines, 240-character titles, 1000-character lines.
  assert.equal(row('r','t',Array.from({length:21},(_,i)=>'l'+i)).lines.length,20);
  assert.equal(row('r','t'.repeat(241),[]).title,'t'.repeat(240)+TRUNCATED);
  assert.equal(row('r','t',['v'.repeat(1001)]).lines[0],'v'.repeat(1000)+TRUNCATED);
  // File window: 512 KiB per read; a header or row beyond it is refused, never read whole.
  assert.equal(MAX_READ,512*1024);
  const big='x'.repeat(MAX_READ+1024);
  const header=JSON.stringify({kind:'header',version:2,scenario:{name:'w'},seed:1,engine:'e',assignments:[]}),tick=JSON.stringify({kind:'tick',status:{tick:0,delivered:0,total:0,collisions:0,score:0},hash:'h'});
  for(const [name,content,message] of [['run-0002',JSON.stringify({kind:'header',pad:big})+'\n'+tick+'\n',/header exceeds the view limit/],['run-0003',header+'\n'+JSON.stringify({kind:'tick',pad:big})+'\n',/row exceeds the view limit/]]){
   const dir=join(f.root,name);await mkdir(dir,{mode:0o700});await writeFile(join(dir,'trajectory.jsonl'),content,{mode:0o600});
   assert.throws(()=>ends(join(dir,'trajectory.jsonl')),message);
   const page=await f.request('coordinator',{view:'runs'});assert.equal(page.status,400);assert.match(page.body.error,message);
   await rm(dir,{recursive:true});
  }
  // File size cap: 256 MiB (a sparse file, so nothing is written).
  const huge=join(f.root,'run-0004');await mkdir(huge,{mode:0o700});const hugePath=join(huge,'trajectory.jsonl');
  await writeFile(hugePath,header+'\n'+tick+'\n',{mode:0o600});await truncate(hugePath,256*1024*1024+1);
  assert.throws(()=>file(hugePath),/unavailable/);assert.equal((await f.request('coordinator',{view:'runs'})).status,400);await rm(huge,{recursive:true});
  // Scenario files: absolute, owned, not group/world writable, below 256 KiB.
  const scene=JSON.stringify(defaultScenario()),scenePath=join(f.root,'scene.json'),sceneBytes=Buffer.byteLength(scene);
  await writeFile(scenePath,scene+' '.repeat(262144-sceneBytes),{mode:0o600});assert.equal(readScenario(scenePath).name,defaultScenario().name);
  await writeFile(scenePath,scene+' '.repeat(262145-sceneBytes),{mode:0o600});assert.throws(()=>readScenario(scenePath),/256 KiB/);
  await writeFile(scenePath,scene,{mode:0o600});await chmod(scenePath,0o622);assert.throws(()=>readScenario(scenePath),/non-writable/);
  assert.throws(()=>readScenario('scene.json'),/absolute/);
  // Action input: 8 KiB on stdin; pane input: 4096 characters with no control, format or separator characters.
  const small=await run(['action','--json'],{SIM_RUN_ROOT:f.root},JSON.stringify({verb:'hold',args:[]}));assert.equal(small.code,0,small.err);assert.equal(JSON.parse(small.out).allowed,false);
  const stdin=await run(['action','--json'],{SIM_RUN_ROOT:f.root},JSON.stringify({verb:'hold',args:['x'.repeat(9000)]}));assert.equal(stdin.code,1);assert.equal(stdin.out,'');assert.equal(stdin.err.trim().split('\n').length,1);
  assert.deepEqual(commandInput('status'+' '.repeat(4090)),{kind:'view',verb:'status'});
  assert.equal(commandInput('status'+' '.repeat(4091)),null);
  for(const chars of Object.values(CLASSES))for(const c of chars)assert.equal(commandInput('status'+c),null,escape(c));
  // Offline pointer: 16 KiB.
  const env={SIM_RUN_ROOT:f.root};await f.hub.close();
  const before=await run(['status','--json'],env);assert.equal(before.code,0,before.err);assert.equal(JSON.parse(before.out).run,'run-0001');
  const pointer=join(f.root,'current-run.json'),value=JSON.parse(await readFile(pointer,'utf8'));
  await writeFile(pointer,JSON.stringify({...value,pad:'p'.repeat(16384)})+'\n');
  const over=await run(['status','--json'],env);assert.equal(over.code,1);assert.equal(over.out,'');assert.match(over.err,/read limit/);
 }finally{await f.close();}
});

test('the hook page parser refuses every out-of-bounds field and sanitizes before anything is drawn',()=>{
 const frame=(patch={})=>({schema:'ai.toolsenabled/sim-view/v1',view:'runs',run:'run-0001',stream:'all',identity:{role:'robot',agentId:'agent-amber',robotId:'amber'},summary:['Run run-0001'],limit:10,revision:'a'.repeat(64),rows:[{id:'run-0001',title:'Visible result',lines:['Caller: robot / agent-amber']}],offset:0,total:21,nextOffset:10,nextCursor:null,...patch});
 assert.equal(parsePage(frame(),'runs').rows[0].title,'Visible result');
 const rows=n=>Array.from({length:n},(_,i)=>({id:'run-'+String(i+1).padStart(4,'0'),title:'t'+i,lines:['l']}));
 const bad=[
  {limit:11,rows:rows(11)},{limit:0,rows:[]},{limit:10,rows:rows(11)},{limit:'10'},
  {summary:Array.from({length:13},()=>'s')},{summary:['s',1]},
  {offset:-1},{offset:1.5},{offset:'0'},{nextOffset:0},{nextOffset:-1},{nextCursor:'bad cursor!'},{nextCursor:'c'.repeat(201)},{total:-1},
  {revision:'zz'},{revision:'A'.repeat(64)},{run:'run-1'},{view:'events'},{schema:'x'},{stream:'bad'},{identity:{role:'launcher',agentId:'x'}},
  {rows:[{id:'x'.repeat(129),title:'t',lines:[]}]},{rows:[{id:'r',title:'t',lines:Array.from({length:21},()=>'l')}]},{rows:[{id:'r',title:'t',lines:['l',2]}]},{rows:[{id:'r',title:3,lines:[]}]},
 ];
 for(const patch of bad)assert.throws(()=>parsePage(frame(patch),'runs'),/Invalid Sim (page|row)/,JSON.stringify(patch).slice(0,80));
 assert.throws(()=>parsePage(frame(),'status'),/Invalid Sim page/);
 assert.throws(()=>parsePage(frame({view:'bogus'}),'bogus'),/Invalid Sim page/);
 const parsed=parsePage(frame({summary:[HOSTILE,'s'.repeat(1001)],rows:[{id:'r',title:HOSTILE+'t'.repeat(240),lines:[HOSTILE,'l'.repeat(1001)]}]}),'runs');
 assert.deepEqual(unsafe(parsed),[]);
 for(const c of ['\u0000','\u0085','‮','⁦','​',' ',' ','\ud800','\u{e0041}'])assert.ok(parsed.summary[0].includes(escape(c)),escape(c));
 assert.equal(parsed.summary[1],'s'.repeat(1000)+TRUNCATED);
 assert.equal(parsed.rows[0].title.length,240+TRUNCATED.length);assert.equal(parsed.rows[0].lines[1],'l'.repeat(1000)+TRUNCATED);
});

test('a view never expires the live round or enters the mutation path, even after the deadline has passed',async()=>{
 const f=await fixture({live:{budgetMs:120000,stepTicks:1,activeRobots:['amber']}});
 try{
  const journal=join(f.hub.runDir,'live.jsonl'),actions=join(f.hub.runDir,'actions.jsonl'),pointer=join(f.root,'current-run.json');
  const first=await f.request('amber',{view:'status'});assert.equal(first.status,200);const round=first.body.live.round;assert.ok(first.body.live.remainingMs>0);
  const before=[await readFile(journal),await readFile(actions),await readFile(pointer,'utf8')];
  // Make the deadline appear long past for anything that consults the clock during these reads.
  const real=performance.now.bind(performance);performance.now=()=>real()+10*120000;
  let during;
  try{
   during=await f.request('amber',{view:'status'});
   for(const view of ['robots','map','runs','events','scenarios','replay','connection'])assert.equal((await f.request('coordinator',{view})).status,200,view);
  }finally{delete performance.now;}
  assert.equal(during.status,200);assert.equal(during.body.live.remainingMs,0);assert.equal(during.body.live.round,round);assert.equal(during.body.live.stopped,null);
  assert.deepEqual([await readFile(journal),await readFile(actions),await readFile(pointer,'utf8')],before);
  const status=await f.call('amber','sim.status');assert.equal(status.result.tick,0);assert.equal(status.result.live.round,round);assert.deepEqual(status.result.live.submitted,[]);
 }finally{await f.close();}
});

test('readers open private files read-only without following symlinks',async()=>{
 const f=await fixture();
 try{
  const path=join(f.hub.runDir,'trajectory.jsonl'),before=await readFile(path);
  const opened=file(path);
  try{
   assert.throws(()=>writeSync(opened.fd,'x'),{code:'EBADF'});
   if(existsSync('/proc/self/fdinfo')){const flags=parseInt(readFileSync(`/proc/self/fdinfo/${opened.fd}`,'utf8').match(/^flags:\s*([0-7]+)/m)[1],8);assert.equal(flags&(constants.O_RDONLY|constants.O_WRONLY|constants.O_RDWR),constants.O_RDONLY);assert.ok(flags&constants.O_NOFOLLOW);}
  }finally{closeSync(opened.fd);}
  assert.deepEqual(await readFile(path),before);
  const link=join(f.root,'link.jsonl');await symlink(path,link);
  for(const read of [file,privateJSON,ends])assert.throws(()=>read(link),{code:'ELOOP'},read.name);
  const connection=join(f.root,'connection-link.json');await symlink(f.hub.connections.amber,connection);assert.throws(()=>readConnection(connection),{code:'ELOOP'});
  const scene=join(f.root,'scene.json');await writeFile(scene,JSON.stringify(defaultScenario()),{mode:0o600});const sceneLink=join(f.root,'scene-link.json');await symlink(scene,sceneLink);
  assert.throws(()=>readScenario(sceneLink),{code:'ELOOP'});assert.equal(readScenario(scene).name,defaultScenario().name);
 }finally{await f.close();}
});

test('a failed current-run pointer write never fails an action, stops a live hub or blocks close',async t=>{
 const f=await fixture({live:{budgetMs:3000,stepTicks:1,activeRobots:['amber']},maxTicks:120});
 const pointer=join(f.root,'current-run.json');const expected=[];
 try{
  const round=async who=>(await f.call(who,'sim.status')).result.live.round;
  if(typeof process.geteuid==='function'&&process.geteuid()!==0){
   await chmod(f.root,0o500);
   const drive=await f.call('amber','robot.drive',{robotId:'amber',v:0,w:0,duration:1,round:await round('amber')});assert.equal(drive.error,undefined);assert.ok(drive.result);
   expected.push(/pointer not updated \(EACCES\)/);assert.equal(f.hub.pointerError,'EACCES');
   assert.equal(f.warnings.length,1);assert.match(f.warnings[0],expected[0]);assert.doesNotMatch(f.warnings[0],new RegExp(f.root));
   assert.equal(JSON.parse(await readFile(pointer,'utf8')).run,'run-0001');
   // The deadline commit still runs and journals while the pointer cannot be replaced.
   const until=Date.now()+20000;let s;do{await delay(100);s=await f.call('amber','sim.status');}while(s.result&&s.result.tick===0&&Date.now()<until);
   assert.equal(s.error,undefined);assert.ok(s.result.tick>=1,String(s.result.tick));assert.equal(s.result.live.stopped,null);
   const commits=(await readFile(join(f.hub.runDir,'live.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(e=>e.kind==='commit');
   assert.ok(commits.length>=1);assert.ok(commits.every(e=>e.reason==='deadline'));
   assert.equal(f.warnings.length,1);
   await chmod(f.root,0o700);
   await f.call('amber','robot.drive',{robotId:'amber',v:0,w:0,duration:1,round:await round('amber')});
   expected.push(/resumed/);assert.equal(f.hub.pointerError,null);assert.equal(f.warnings.length,2);assert.match(f.warnings[1],expected[1]);
   assert.equal(JSON.parse(await readFile(pointer,'utf8')).live.round,await round('amber'));
  }else t.diagnostic('directory permissions are not enforced for this user; EACCES phase not checked');
  // A pointer that cannot be replaced (here: a directory in its place) does not stop reset or close.
  await rm(pointer);await mkdir(pointer);
  const reset=await f.call('coordinator','sim.reset');assert.equal(reset.error,undefined);assert.equal(reset.result.run,'run-0002');
  expected.push(/pointer not updated \(EISDIR\)/);assert.equal(f.hub.pointerError,'EISDIR');assert.equal(f.warnings.length,expected.length);assert.match(f.warnings.at(-1),expected.at(-1));
  assert.equal((await f.call('amber','sim.status')).result.tick,0);
  await rmdir(pointer);
  await f.call('amber','robot.drive',{robotId:'amber',v:0,w:0,duration:1,round:await round('amber')});
  expected.push(/resumed/);assert.equal(f.hub.pointerError,null);assert.equal(f.warnings.length,expected.length);
  assert.equal(JSON.parse(await readFile(pointer,'utf8')).run,'run-0002');
  await rm(pointer);await mkdir(pointer);
  await f.hub.close();
  expected.push(/pointer not updated \(EISDIR\)/);assert.equal(f.hub.pointerError,'EISDIR');assert.equal(f.warnings.length,expected.length);
  for(let i=0;i<expected.length;i++)assert.match(f.warnings[i],expected[i]);
  assert.ok(existsSync(join(f.root,'run-0002','trajectory.jsonl')));assert.ok(!existsSync(join(f.root,'hub.lock')));
 }finally{await chmod(f.root,0o700).catch(()=>{});await f.close();}
});
