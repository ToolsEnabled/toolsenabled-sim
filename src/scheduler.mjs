// One job per identity per turn. Admission limits belong to the authenticated caller.
export function fairScheduler(){
 const queues=new Map(),ready=[],waiters=[];let running=false;
 async function pump(){
  const key=ready.shift(),queue=queues.get(key),job=queue.shift();
  try{job.resolve(await job.fn());}catch(e){job.reject(e);}
  if(queue.length)ready.push(key);else queues.delete(key);
  if(ready.length)setImmediate(pump);else{running=false;for(const done of waiters.splice(0))done();}
 }
 return {enqueue(key,fn){return new Promise((resolve,reject)=>{let queue=queues.get(key);if(!queue){queue=[];queues.set(key,queue);ready.push(key);}queue.push({fn,resolve,reject});if(!running){running=true;setImmediate(pump);}});},drain(){return running?new Promise(resolve=>waiters.push(resolve)):Promise.resolve();}};
}
