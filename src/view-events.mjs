import {closeSync} from 'node:fs';
import {join} from 'node:path';
import {file,bytes,unchanged,MAX_READ,problem,digest,checkRevision} from './view-files.mjs';
import {displayText} from './display.mjs';
export function scenarioSummary(s){return `${s?.name||'unnamed'}: ${s?.robots?.length||0} robots, ${s?.crates?.length||0} crates, ${s?.zones?.length||0} zones, ${s?.obstacles?.length||0} racks`;}
function allowed(a,identity){
 if(identity.role==='coordinator')return true;
 const caller=a.caller||a.identity,robot=a.robotId||a.args?.robotId;
 if(identity.role==='robot'&&robot===identity.robotId)return true;
 return caller?.role==='launcher'&&!robot&&['commit','sim.step','recording.stop'].includes(a.kind||a.name);
}
export function eventPage(root,run,identity,q){
 const streams=q.stream==='actions'?['actions']:q.stream==='rounds'?['rounds']:['actions','rounds'];const opened=[];
 try{
  for(const name of streams){try{opened.push({name,f:file(join(root,run,name==='rounds'?'live.jsonl':'actions.jsonl'))});}catch(e){if(e.code!=='ENOENT')throw e;}}
  const revision=digest([run,identity,streams,opened.map(s=>s.f.stamp)]);checkRevision(q,revision);
  let positions;
  if(q.cursor!==undefined){
   if(!q.revision||!/^[A-Za-z0-9_-]{1,200}$/.test(q.cursor))throw problem('Invalid event cursor.');
   try{positions=JSON.parse(Buffer.from(q.cursor,'base64url'));}catch{throw problem('Invalid event cursor.');}
   if(!Array.isArray(positions)||positions.length!==opened.length)throw problem('Invalid event cursor.');
  }
  const pending=[];
  opened.forEach((s,i)=>{
   const before=positions?.[i]??s.f.size;if(!Number.isSafeInteger(before)||before<0||before>s.f.size||before&&bytes(s.f,before-1,1)[0]!==10)throw problem('Invalid event cursor.');
   s.position=before;const begin=Math.max(0,before-MAX_READ),data=bytes(s.f,begin,before-begin);
   let start=begin?data.indexOf(10)+1:0;if(begin&&!start)throw problem('Event row exceeds the view limit.');
   s.floor=begin+start;
   while(start<data.length){const end=data.indexOf(10,start);if(end<0)throw problem('Event recording is incomplete.');
    const a=JSON.parse(data.subarray(start,end));pending.push({a,stream:s,start:begin+start,tick:a.tick??Number(String(a.round||'0:0').split(':').at(-1))});start=end+1;
   }
  });
  pending.sort((a,b)=>b.tick-a.tick||(a.stream.name===b.stream.name?b.start-a.start:a.stream.name==='rounds'?-1:1));
  const rows=[];let visited=0;
  for(const entry of pending){visited++;const {a,stream,start}=entry;stream.position=start;if(!allowed(a,identity))continue;
   const caller=a.caller||a.identity||{},robot=a.robotId||a.args?.robotId;
   const args=a.name==='sim.scenario'?`Scenario: ${scenarioSummary(a.args?.scenario)}; ${a.args?.assignments?.length||0} assignments`:a.args?`Arguments: ${JSON.stringify(a.args)}`:null;
   rows.push({id:`${stream.name}:${start}`,title:displayText(`${a.name||a.kind} · tick ${a.tick??'—'} · order ${a.order??'—'}`,240),lines:[
    `Caller: ${caller.role||'unrecorded'} / ${caller.agentId||'unrecorded'}`,`Robot: ${robot||'shared'}`,
    ...(a.round?[`Round: ${a.round}`]:[]),...(a.reason?[`Reason: ${a.reason}`]:[]),...(args?[args]:[]),
   ].map(v=>displayText(v,1000))});if(rows.length===q.limit)break;
  }
  if(visited===pending.length)for(const s of opened)s.position=s.floor;
  for(const s of opened)unchanged(s.f);
  const next=opened.map(s=>s.position);
  return {revision,rows,nextCursor:next.some(Boolean)?Buffer.from(JSON.stringify(next)).toString('base64url'):null,nextOffset:null,total:null,offset:0};
 }finally{for(const s of opened)closeSync(s.f.fd);}
}
