import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {startHub} from '../src/hub.mjs';
import {readerRequest,envLacksSplit} from '../hooks/view.mjs';

// 0.1.12: the mod starts the reader with one of two commands written as fixed text in hooks/register.tsx, so the plugin
// directory can read them in full. Everything that varies (the view, the configured paths, the pane's options, an action's
// arguments) reaches the reader as one JSON request on standard input. These tests run both commands for real.
const READER=['/usr/bin/env','-i','-S','PATH=${PATH}:/usr/local/bin:/usr/bin:/bin','LANG=C.UTF-8','node','tools/sim-view.mjs','--pane'];
const BUSYBOX_READER=['/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','LANG=C.UTF-8','node','tools/sim-view.mjs','--pane'];
const repo=resolve(new URL('../',import.meta.url).pathname);
const standardNode=['/usr/local/bin/node','/usr/bin/node','/bin/node'].some(p=>existsSync(p));

test('the mod starts a program only through the two fixed reader commands and reads no environment variable',async()=>{
 const source=await readFile(join(repo,'hooks/register.tsx'),'utf8');
 const calls=[...source.matchAll(/\$\.process\.run\((\[[^\]]*\])/g)].map(m=>JSON.parse(m[1].replaceAll("'",'"')));
 assert.deepEqual(calls,[READER,BUSYBOX_READER]);
 assert.equal(source.match(/\$\.process\./g).length,2);assert.doesNotMatch(source,/\$\.env\./);
});

// A scratch plugin folder whose tools/sim-view.mjs reports what reached it, and a node on a PATH entry with a space in it
// that marks the start, so the test sees which node the command found.
async function scratch(){
 const root=await mkdtemp(join(tmpdir(),'sim-pane-env-'));await mkdir(join(root,'tools'));
 await writeFile(join(root,'tools','sim-view.mjs'),"let input='';for await(const b of process.stdin)input+=b;console.log(JSON.stringify({argv:process.argv.slice(2),env:process.env,input}))");
 const bin=join(root,'user node bin');await mkdir(bin);
 // The shell would export PWD on its own, so the stand-in drops it: the test sees exactly what env passed on.
 await writeFile(join(bin,'node'),`#!/bin/sh\nunset PWD OLDPWD\nexec '${process.execPath.replaceAll("'","'\\''")}' "$@" --started-from-user-path\n`);await chmod(join(bin,'node'),0o755);
 return {root,bin};
}
const run=(argv,root,env,input)=>spawnSync(argv[0],argv.slice(1),{cwd:root,env,input,encoding:'utf8',timeout:10000});

test('the reader starts with only PATH and LANG: node from your PATH, every other variable removed before Node starts',async()=>{
 const {root,bin}=await scratch();
 try{
  const inherited={PATH:bin+':/nonexistent-sim-dir',HOME:root,SIM_CANARY_ONE:'canary',SIM_CANARY_TWO:'canary',SIM_CONNECTION:'/canary/connection.json',NODE_OPTIONS:'--require=/nonexistent/sim-canary.cjs'};
  // The canaries are armed: an ordinary child sees them, and Node refuses to start with that NODE_OPTIONS.
  const plain=spawnSync(process.execPath,['-e','console.log(JSON.stringify(Object.keys(process.env)))'],{env:{...inherited,NODE_OPTIONS:''},encoding:'utf8'});
  assert.equal(plain.status,0,plain.stderr);for(const name of ['SIM_CANARY_ONE','SIM_CANARY_TWO','SIM_CONNECTION','HOME'])assert.ok(JSON.parse(plain.stdout).includes(name),name);
  assert.notEqual(spawnSync(process.execPath,['-e','0'],{env:{NODE_OPTIONS:inherited.NODE_OPTIONS},encoding:'utf8'}).status,0);
  for(const view of ['status','action']){
   const request=view==='action'?readerRequest('action','/private/run/connection-amber.json','/private/run',{},{verb:'step',args:[60]}):readerRequest('events','/private/run/connection-amber.json','',{stream:'all',offset:10});
   const child=run(READER,root,inherited,request);assert.equal(child.status,0,child.stderr);const seen=JSON.parse(child.stdout);
   assert.deepEqual(Object.keys(seen.env).sort(),['LANG','PATH']);assert.equal(seen.env.LANG,'C.UTF-8');
   assert.equal(seen.env.PATH,inherited.PATH+':/usr/local/bin:/usr/bin:/bin');
   assert.deepEqual(seen.argv,['--pane','--started-from-user-path']);assert.equal(seen.input,request);
  }
  assert.deepEqual(JSON.parse(readerRequest('events','/c','',{stream:'all',offset:10})),{view:'events',connection:'/c',root:'',options:{stream:'all',offset:'10'}});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('with PATH empty or unset the reader still finds node in /usr/local/bin, /usr/bin or /bin',{skip:!standardNode&&'no node in a standard folder'},async()=>{
 const {root}=await scratch();
 try{
  for(const env of [{HOME:root},{HOME:root,PATH:''}]){
   const child=run(READER,root,env,'{}');assert.equal(child.status,0,child.stderr);const seen=JSON.parse(child.stdout);
   assert.deepEqual(Object.keys(seen.env).sort(),['LANG','PATH']);assert.equal(seen.env.PATH,':/usr/local/bin:/usr/bin:/bin');assert.deepEqual(seen.argv,['--pane']);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

test('an env without -S refuses before anything starts, and the second command clears the environment the same way',{skip:!standardNode&&'no node in a standard folder'},async()=>{
 const {root,bin}=await scratch();
 try{
  const inherited={PATH:bin,HOME:root,SIM_CANARY_ONE:'canary',NODE_OPTIONS:'--require=/nonexistent/sim-canary.cjs'};
  // GNU env runs the second command too; BusyBox env, where present, shows the refusal the mod falls back on.
  const envs=[['/usr/bin/env'],...(existsSync('/usr/bin/busybox')?[['/usr/bin/busybox','env']]:[])];
  for(const env of envs){
   const child=run([...env,...BUSYBOX_READER.slice(1)],root,inherited,'{"view":"status"}');assert.equal(child.status,0,child.stderr);const seen=JSON.parse(child.stdout);
   assert.deepEqual(Object.keys(seen.env).sort(),['LANG','PATH']);assert.equal(seen.env.PATH,'/usr/local/bin:/usr/bin:/bin');assert.deepEqual(seen.argv,['--pane']);assert.equal(seen.input,'{"view":"status"}');
  }
  if(envs.length>1){
   const refused=run(['/usr/bin/busybox','env',...READER.slice(1)],root,inherited,'{}');
   assert.equal(refused.status,1);assert.equal(refused.stdout,'');assert.match(refused.stderr,envLacksSplit);
  }
  for(const text of ["env: invalid option -- 'S'\n","env: unrecognized option: S\n"])assert.match(text,envLacksSplit);
  assert.doesNotMatch('Sim view failed. Check arguments, private file ownership and configuration.\n',envLacksSplit);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('sim-view --pane answers exactly as the flags do, and refuses a malformed request',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sim-pane-request-'));const hub=await startHub({root});
 try{
  const cli=join(repo,'tools/sim-view.mjs'),base={PATH:process.env.PATH};
  // Asynchronous children: the hub runs in this process and must keep serving while a reader waits on it.
  const exec=(args,env,input)=>new Promise(done=>{const p=spawn(process.execPath,[cli,...args],{env,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('close',status=>done({status,stdout,stderr}));p.stdin.end(input);});
  const pane=(input,extra=[])=>exec(['--pane',...extra],base,input);
  const flags=(who,args,input='')=>exec(args,{...base,SIM_CONNECTION:hub.connections[who],SIM_RUN_ROOT:root},input);
  for(const [view,options] of [['status',{}],['robots',{}],['map',{}],['runs',{}],['events',{stream:'actions'}],['events',{stream:'all',offset:0}],['replay',{}],['scenarios',{}],['connection',{}]]){
   const a=await pane(readerRequest(view,hub.connections.amber,root,options)),b=await flags('amber',[view,'--json',...Object.entries(options).flatMap(([k,v])=>['--'+k,String(v)])]);
   assert.equal(a.status,0,a.stderr);assert.equal(b.status,0,b.stderr);assert.deepEqual(JSON.parse(a.stdout),JSON.parse(b.stdout),view);
  }
  const noRoot=await pane(readerRequest('status',hub.connections.coordinator,'',{}));assert.equal(noRoot.status,0,noRoot.stderr);assert.match(noRoot.stdout,/coordinator/);
  const allowed=[];for(const [who,action] of [['amber',{verb:'step',args:[60]}],['coordinator',{verb:'step',args:[60]}],['coordinator',{verb:'move',args:['amber',1.25,-2]}],['amber',{verb:'deliver',args:[]}]]){
   const a=await pane(readerRequest('action',hub.connections[who],root,{},action)),b=await flags(who,['action','--json'],JSON.stringify(action));
   assert.equal(a.status,0,a.stderr);assert.deepEqual(JSON.parse(a.stdout),JSON.parse(b.stdout),JSON.stringify(action));allowed.push(JSON.parse(a.stdout).allowed);
  }
  // The hub answered live: the coordinator's step and move pass the preflight, amber's step does not, amber's deliver does.
  assert.deepEqual(allowed,[false,true,true,true]);
  const usage='Sim view failed. Check arguments, private file ownership and configuration.\n';
  const good=JSON.parse(readerRequest('status',hub.connections.amber,root,{}));
  for(const [label,input] of [['empty',''],['not JSON','status'],['array','[]'],['missing fields',JSON.stringify({view:'status'})],['extra field',JSON.stringify({...good,env:{}})],
   ['unknown option',JSON.stringify({...good,options:{verb:'step'}})],['number option',JSON.stringify({...good,options:{offset:10}})],['number path',JSON.stringify({...good,root:1})],
   ['action without action',JSON.stringify({...good,view:'action'})],['view with action',JSON.stringify({...good,action:{verb:'step',args:[]}})],
   ['oversized',JSON.stringify({...good,root:'/'+'x'.repeat(70000)})],['oversized action',JSON.stringify({...good,view:'action',action:{verb:'scenario',args:['/'+'x'.repeat(9000)]}})]]){
   const r=await pane(input);assert.equal(r.status,1,label);assert.equal(r.stdout,'',label);assert.equal(r.stderr,usage,label);
  }
  const extra=await pane(readerRequest('status',hub.connections.amber,root,{}),['status']);assert.equal(extra.status,1);assert.equal(extra.stderr,usage);
 }finally{await hub.close();await rm(root,{recursive:true,force:true});}
});
