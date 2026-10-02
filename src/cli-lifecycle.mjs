import {isAbsolute} from 'node:path';
export function absoluteInputPath(value,label){
 if(typeof value!=='string'||!value||value.startsWith('~')||!isAbsolute(value))throw new Error(label+' requires an absolute path');
 return value;
}
export async function runCli(main){
 try{await main();}
 catch(error){console.error(String(error.message??error).replace(/\s*[\r\n]+\s*/g,' '));process.exitCode=1;}
}
// Register before starting asynchronous allocation; close once when the hub arrives.
export async function runHubCli(start,ready){
 let resource,requested=false,closing;
 const close=()=>resource?(closing??=resource.hub.close()):Promise.resolve();
 for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>{requested=true;close().catch(error=>{process.exitCode=1;console.error(error.message);});});
 try{resource=await start();if(requested)await close();else ready(resource);}
 catch(error){if(resource)await close();throw error;}
}
