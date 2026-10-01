import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
async function probe(messages,{status=200,hang=false}={}){
 const root=await mkdtemp(join(tmpdir(),'sim-protocol-'));const server=http.createServer((req,res)=>{req.resume();if(!hang){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({result:{tools:[]}}));}});let child;
 try{await new Promise(r=>server.listen(0,'127.0.0.1',r));const path=join(root,'connection.json');await writeFile(path,JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,token:'a'.repeat(64)}),{mode:0o600});child=spawn(process.execPath,['src/mcp.mjs'],{env:{...process.env,SIM_CONNECTION:path},stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);const before=performance.now();const end=new Promise(r=>child.on('close',(code,signal)=>r({code,signal})));const kill=setTimeout(()=>child.kill('SIGKILL'),4000);child.stdin.end(messages.map(m=>JSON.stringify(m)+'\n').join(''));const result=await end;clearTimeout(kill);return {...result,ms:performance.now()-before,rows:out.trim().split('\n').filter(Boolean).map(JSON.parse),err};}
 finally{child?.kill('SIGKILL');server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
}
const init={jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:'2025-06-18'}};
test('I-4: ping precedes initialization and invalid requests preserve a usable id',async()=>{
 const r=await probe([{jsonrpc:'2.0',id:'ping',method:'ping'},{jsonrpc:'1.0',id:'bad-envelope',method:'ping'}]);assert.equal(r.code,0,r.err);assert.deepEqual(r.rows[0].result,{});assert.equal(r.rows[1].id,'bad-envelope');assert.equal(r.rows[1].error.code,-32600);
});
test('I-4: oversized and throttled hub requests return meaningful protocol errors',async()=>{
 for(const [status,code,message] of [[413,-32006,/too large/],[429,-32005,/quota/],[401,-32001,/capability/]]){const r=await probe([init,{jsonrpc:'2.0',id:1,method:'tools/list'}],{status});assert.equal(r.rows[1].error.code,code);assert.match(r.rows[1].error.message,message);}
});
test('I-4: EOF bounds a full queue behind an unresponsive hub',async()=>{
 const r=await probe([init,...Array.from({length:31},(_,i)=>({jsonrpc:'2.0',id:i+1,method:'tools/list'}))],{hang:true});assert.equal(r.code,0,JSON.stringify(r));assert.ok(r.ms<3500);assert.equal(r.rows.length,32);
});
