import {closeSync,readFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {displayText} from './display.mjs';
import {deliveryRule,deliveryAreas} from './delivery.mjs';
import {views,helpRows} from './command-catalog.mjs';
import {file,ends,runNames,number,checkRevision,digest,problem} from './view-files.mjs';
import {eventPage,scenarioSummary} from './view-events.mjs';
export const row=(id,title,lines)=>({id:String(id),title:displayText(title,240),lines:lines.map(v=>displayText(v,1000)).slice(0,20)});
export function paged(rows,q,scope=[]){const revision=digest([scope,rows]);checkRevision(q,revision);return {revision,rows:rows.slice(q.offset,q.offset+q.limit),offset:q.offset,total:rows.length,nextOffset:q.offset+q.limit<rows.length?q.offset+q.limit:null,nextCursor:null};}
export const safeTree=value=>typeof value==='string'?displayText(value,1000):Array.isArray(value)?value.map(safeTree):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[displayText(k),safeTree(v)])):value;
export function staticView(view,rows,params=new URLSearchParams(),extra={}){
 const q={limit:number(params.get('limit')??undefined,10,10),offset:number(params.get('offset')??undefined,0,4096),revision:params.get('revision')};if(!q.limit)throw problem('Invalid view page.');
 return {schema:'ai.toolsenabled/sim-view/v1',view,run:null,stream:'all',identity:{role:'observer',agentId:'unbound'},whoami:{role:'observer',agentId:'unbound',active:false},online:false,mode:null,live:null,summary:['Read-only · no model turn'],limit:q.limit,...extra,...paged(rows,q,[view,extra])};
}
const metric=s=>`Tick ${s.tick} · ${s.delivered}/${s.total} delivered · ${s.collisions} collisions · score ${s.score}`;
const visible=(identity,header)=>identity.role!=='robot'||header.assignments?.some(a=>a.robotId===identity.robotId&&a.agentId===identity.agentId);
function modeOf(root,run){try{const s=lstatSync(join(root,run,'live.jsonl'));if(s.isSymbolicLink()||!s.isFile())throw problem('Private event file is unavailable.');return 'live';}catch(e){if(e.code==='ENOENT')return 'manual';throw e;}}
export function readView({root,sim,live,run,instanceId,online=true},identity,params){
 try{
  const fields=['view','run','stream','offset','limit','cursor','revision'];
  for(const [key] of params)if(!fields.includes(key)||params.getAll(key).length!==1)throw problem('Invalid view query.');
  const q=Object.fromEntries(params),view=q.view||'status';if(!views.includes(view))throw problem('Unknown Sim view.');
  if(q.revision&&!/^[a-f0-9]{64}$/.test(q.revision))throw problem('Invalid view revision.');
  q.limit=number(q.limit,10,10);q.offset=number(q.offset,0,4096);if(!q.limit)throw problem('Invalid view page.');
  if(view==='help')return staticView('help',helpRows(),params);
  if(view!=='events'&&(q.cursor!==undefined||q.stream!==undefined)||q.run&&!['events','replay'].includes(view)||view==='events'&&q.offset)throw problem('Invalid view query.');
  const selected=q.run||run;if(selected&&!/^run-\d{4,10}$/.test(selected))throw problem('Invalid run selection.');
  if(!sim&&view!=='runs')throw problem('Select a retained run; no current-run pointer is available.');
  const header=sim?{...sim.header,assignments:sim.workRecord?.()||sim.header.assignments}:null,state=sim?.status(),snapshot=sim?.snapshot(),liveState=live?.viewStatus();
  const own=header?.assignments.find(a=>a.robotId===identity.robotId&&a.agentId===identity.agentId);
  const whoami={...identity,driverLabel:own?.driverLabel||identity.agentId,active:online&&identity.role==='robot'&&!!own&&(!liveState||liveState.activeRobots.includes(identity.robotId))};
  const mode=liveState?'live':selected?modeOf(root,selected):null;
  const summary=[`Run ${selected||'not selected'} · ${mode||'history'} · ${online?'online':'offline / last recorded'}`,`Bound role: ${identity.role} / ${identity.agentId}`].map(v=>displayText(v));
  let page,rows;
  if(view==='events'){
   if(q.stream&&!['all','actions','rounds'].includes(q.stream))throw problem('Invalid event stream.');
   if(!runNames(root).includes(selected))throw problem('Run is unavailable.');
   const saved=ends(join(root,selected,'trajectory.jsonl'));if(!visible(identity,saved.header))throw problem('Run is unavailable.',403);
   page=eventPage(root,selected,identity,q);
   if(!page.rows.length){
    if(!online&&identity.role==='observer')summary.push('No events are visible to an unbound offline observer on this page; set SIM_CONNECTION to a bound connection.');
    else summary.push('No events are visible to this connection on this page.');
   }
  }else if(view==='runs'){
   const names=runNames(root),stamps=names.map(n=>{const f=file(join(root,n,'trajectory.jsonl'));closeSync(f.fd);return [n,f.stamp,modeOf(root,n)];});
   const revision=digest([view,identity,run,stamps]);checkRevision(q,revision);
   rows=names.slice(q.offset,q.offset+q.limit).map(n=>{const saved=ends(join(root,n,'trajectory.jsonl'));if(JSON.stringify(saved.stamp)!==JSON.stringify(stamps.find(s=>s[0]===n)[1]))throw problem('Run changed. Reload the view.',409);
    return visible(identity,saved.header)?row(n,`${n} · ${n===run?'current pointer':'retained'}`,[metric(saved.last.status),`Scenario: ${saved.header.scenario.name}`,`Mode: ${modeOf(root,n)}`,`Stop reason: ${saved.last.status.stopReason||(saved.last.status.complete?'complete':'not recorded')}`,`Seed: ${saved.header.seed}`,`Engine: ${saved.header.engine}`,`Final hash: ${saved.last.hash}`]):row(n,`${n} · unavailable`,['This connection has no assignment in that run.']);});
   page={revision,rows,offset:q.offset,total:names.length,nextOffset:q.offset+q.limit<names.length?q.offset+q.limit:null,nextCursor:null};
  }else if(view==='status')rows=[row('whoami','This connection',[`Role: ${whoami.role}`,`Agent: ${whoami.agentId}`,`Robot: ${whoami.robotId||'none'}`,`Driver: ${whoami.driverLabel}`,`Active: ${whoami.active}`]),row('score','Result',[metric(state)]),row('clock','Clock',[`Mode: ${mode}`,`Time: ${state.time} seconds`,`Remaining ticks: ${state.remainingTicks}`]),row('stop','State',[`Complete: ${state.complete}`,`Stop reason: ${state.stopReason||liveState?.stopped||'not stopped in recording'}`]),
   ...(liveState?[row('round','Live round',[`Round: ${liveState.round}`,`Awaiting: ${liveState.awaiting.join(', ')||'none'}`,`Submitted: ${liveState.submitted.join(', ')||'none'}`,`Step: ${liveState.stepTicks} ticks · deadline budget: ${liveState.budgetMs/1000} s`,online?`Seconds to deadline: ${Math.ceil(liveState.remainingMs/1000)}`:'Deadline is historical; hub unreachable.'])]:[]),row('delivery','Delivery rule',[deliveryRule])];
  else if(view==='robots')rows=snapshot.robots.map(r=>{
   const full=identity.role==='coordinator'||identity.role==='robot'&&r.id===identity.robotId&&r.agentId===identity.agentId;
   if(!full)return row(r.id,r.id,[`Position: ${r.x}, ${r.y} · heading ${r.heading}`,`Holding: ${r.holding||'none'}`]);
   const a=header.assignments.find(a=>a.robotId===r.id),crate=snapshot.crates.find(c=>c.id===a.crateId),area=deliveryAreas(header.scenario.zones).find(z=>z.zoneId===crate?.zone);
   return row(r.id,`${r.id} · ${a.driverLabel||a.agentId}`,[`Agent: ${a.agentId}`,`Position: ${r.x}, ${r.y} · heading ${r.heading}`,`Assigned crate: ${a.crateId} · delivered: ${crate?.delivered}`,`Holding: ${r.holding||'none'}`,`Task: ${a.taskId} · Ledger: ${a.ledgerId}`,`Action: ${JSON.stringify(r.action)}`,`Last caller: ${r.caller?.role||'unrecorded'} / ${r.caller?.agentId||'unrecorded'}`,...(area?[`Delivery area: ${JSON.stringify(area.centerBounds)}`]:[])]);
  });
  else if(view==='map'){
   const grid=Array.from({length:13},()=>Array(33).fill('.')),s=header.scenario;
   for(const [items,char] of [[s.zones,'Z'],[s.obstacles,'#'],[snapshot.crates,'C'],[snapshot.robots,'R']])for(const o of items){const x=Math.round((o.x/s.arena.width+.5)*32),y=Math.round((o.y/s.arena.depth+.5)*12);if(grid[y]?.[x])grid[y][x]=identity.role==='robot'&&o.id===identity.robotId?'@':char;}
   rows=[row('map','@ you / R robot / C crate / Z zone / # rack',grid.map(r=>r.join(''))),...s.zones.map(z=>row(z.id,`${z.label} (${z.id})`,[`Center: ${z.x}, ${z.y}`,`Delivery area: ${JSON.stringify(deliveryAreas([z])[0].centerBounds)}`]))];
  }else if(view==='scenarios'){
   const shipped=JSON.parse(readFileSync(new URL('../scenarios/warehouse.json',import.meta.url),'utf8'));
   rows=[row('warehouse','Shipped: scenarios/warehouse.json',[scenarioSummary(shipped),`Arena: ${shipped.arena.width} × ${shipped.arena.depth}`]),row('current','Current scenario',[scenarioSummary(header.scenario),`Arena: ${header.scenario.arena.width} × ${header.scenario.arena.depth}`])];
  }else if(view==='replay'){
   if(!runNames(root).includes(selected))throw problem('Run is unavailable.');const saved=ends(join(root,selected,'trajectory.jsonl'));if(!visible(identity,saved.header))throw problem('Run is unavailable.',403);
   rows=[row('replay',`Replay ${selected}`,[`Final hash: ${saved.last.hash}`,'Run tools/replay.mjs with the absolute run directory to verify physics and bytes.','Run tools/capture.mjs --run <absolute-run-dir> --output <new-directory> for frames.','Capture requires Playwright Chromium; it is a human-run command outside this pane.','No verification has been run by this view.'])];
  }else if(view==='connection')rows=[row('hub','Hub connection',[`Reachable: ${online}`,`Mode: ${mode}`,`Role: ${whoami.role}`,`Agent: ${whoami.agentId}`,`Robot: ${whoami.robotId||'none'}`])];
  if(!page)page=paged(rows,q,[view,identity,selected]);
  const actionContext=header?{arena:header.scenario.arena,robotIds:header.scenario.robots.map(r=>r.id),crateIds:header.scenario.crates.map(c=>c.id),...(identity.role==='coordinator'?{assignments:header.assignments}:{}),stopped:!!state.stopReason||state.complete||!!liveState?.stopped}:null;
  const result=safeTree({schema:'ai.toolsenabled/sim-view/v1',view,run:selected||null,stream:q.stream||'all',identity,whoami,instanceId,online,mode,live:liveState||null,summary,actionContext,limit:q.limit,...page});
  if(Buffer.byteLength(JSON.stringify(result))>65536)throw problem('Sim view exceeds its output limit. Select a smaller page.');return result;
 }catch(e){if(e.status)throw e;throw problem('Sim view is unavailable. Check the running hub and private run files.');}
}
