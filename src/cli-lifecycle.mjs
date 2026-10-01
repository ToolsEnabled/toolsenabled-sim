// Register before starting asynchronous allocation; close once when the hub arrives.
export async function runHubCli(start,ready){
 let resource,requested=false,closing;
 const close=()=>resource?(closing??=resource.hub.close()):Promise.resolve();
 for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>{requested=true;close().catch(error=>{process.exitCode=1;console.error(error.message);});});
 try{resource=await start();if(requested)await close();else ready(resource);}
 catch(error){if(resource)await close();throw error;}
}
