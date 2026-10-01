import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export class McpClient{
 constructor(connection){
  this.nextId=0;this.pending=new Map();this.buffer='';this.stderr='';this.child=spawn(process.execPath,[fileURLToPath(new URL('../src/mcp.mjs',import.meta.url))],{env:{...process.env,SIM_CONNECTION:connection},stdio:['pipe','pipe','pipe']});
  this.exited=new Promise(resolve=>this.child.once('exit',(code,signal)=>{this.exit={code,signal};for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('MCP exited'));}this.pending.clear();resolve(this.exit);}));
  this.child.stderr.on('data',b=>{this.stderr=(this.stderr+b).slice(-8192);});
  this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',data=>{this.buffer+=data;while(this.buffer.includes('\n')){const i=this.buffer.indexOf('\n'),line=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+1);const r=JSON.parse(line),p=this.pending.get(r.id);if(p){clearTimeout(p.timer);this.pending.delete(r.id);r.error?p.reject(new Error(r.error.message)):p.resolve(r.result);}}});
 }
 request(method,params){const id=++this.nextId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`MCP timeout: ${method}`));},15000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
 async initialize(){return this.request('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'sim-script',version:'1'}});}
 async call(name,args){const r=await this.request('tools/call',{name,arguments:args});if(r.isError)throw new Error(r.content[0].text);return JSON.parse(r.content[0].text);}
 async close(){if(this.exit)return this.exit;this.child.stdin.end();const timeout=setTimeout(()=>this.child.kill('SIGKILL'),5000);const result=await this.exited;clearTimeout(timeout);if(result.code!==0)throw new Error(`MCP did not exit cleanly: ${JSON.stringify(result)}`);return result;}
}
