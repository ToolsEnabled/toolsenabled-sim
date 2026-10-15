// Test HTTP requests are confined to the fixture's loopback hub and never start a program.
function endpoint(config,path){
 const url=new URL(config.url);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw Error('A local test hub is required');
 return new URL(path,url);
}
export function hubCall(config,name='sim.status',args={},timeout=1500){return fetch(endpoint(config,'/call'),{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify({method:'tools/call',params:{name,arguments:args}}),redirect:'error',signal:AbortSignal.timeout(timeout)});}
export async function hubView(config,query={}){const url=endpoint(config,'/view');url.search=new URLSearchParams(query);const response=await fetch(url,{headers:{authorization:`Bearer ${config.token}`},redirect:'error'});const text=await response.text();return {status:response.status,body:JSON.parse(text),bytes:Buffer.byteLength(text)};}
