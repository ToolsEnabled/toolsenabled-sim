// Qualification-only preload. Records successful module loads and file reads;
// never imports dependencies itself or forces optional files to be loaded.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const {fileURLToPath}=require('node:url'),{registerHooks,syncBuiltinESMExports}=require('node:module');
const root=process.env.SIM_TRACE_ROOT,out=process.env.SIM_TRACE_DIR,append=fs.appendFileSync;
if(!root||!out||!path.isAbsolute(root)||!path.isAbsolute(out))throw Error('Absolute trace root/output required');
const seen=new Set();
function record(value,kind){
 try{const absolute=value instanceof URL?fileURLToPath(value):typeof value==='string'?path.resolve(value):null;
  if(!absolute||!absolute.startsWith(root+'/node_modules/'))return;
  const name=path.relative(root,absolute),key=kind+':'+name;if(seen.has(key))return;seen.add(key);
  append(path.join(out,process.pid+'.jsonl'),JSON.stringify({file:name,kind})+'\n',{mode:0o600});
 }catch(error){if(error.code)throw error;}
}
registerHooks({load(url,context,next){const result=next(url,context);if(url.startsWith('file:'))record(new URL(url),'module');return result;}});
const sync=fs.readFileSync;fs.readFileSync=function(file,...args){const data=sync.call(this,file,...args);record(file,'read');return data;};
const asyncRead=fs.readFile;fs.readFile=function(file,...args){const callback=args.pop();return asyncRead.call(this,file,...args,(err,data)=>{if(!err)record(file,'read');callback(err,data);});};
const promiseRead=fsp.readFile;fsp.readFile=async function(file,...args){const asset=new Error().stack.includes(root+'/src/replay-server.mjs');const data=await promiseRead.call(this,file,...args);record(file,asset?'server-asset':'read');return data;};
const stream=fs.createReadStream;fs.createReadStream=function(file,...args){const result=stream.call(this,file,...args);result.once('open',()=>record(file,'stream'));return result;};
syncBuiltinESMExports();
