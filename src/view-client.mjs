import {constants,openSync,closeSync,fstatSync,readFileSync,lstatSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readConnection,privateRoot} from './private-files.mjs';
import {readView,row,staticView,paged} from './views.mjs';
import {privateJSON,ends,runNames,problem} from './view-files.mjs';
import {deliveryAreas,deliveryRule} from './delivery.mjs';
import {helpRows,actions} from './command-catalog.mjs';
import {validateScenario,validateAssignments} from './sim.mjs';
import {validateCall} from './schema.mjs';
import {scenarioSummary} from './view-events.mjs';

const pluginRoot=fileURLToPath(new URL('../',import.meta.url));
const packageVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version;
const shell=value=>"'"+value.replaceAll("'","'\\''")+"'";
export function readScenario(path,assignments){
 if(!isAbsolute(path))throw problem('Scenario path must be absolute.');
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);let input;
 try{const s=fstatSync(fd);if(!s.isFile()||s.uid!==process.geteuid()||(s.mode&0o022)||s.size>262144)throw problem('Scenario must be an owned, non-writable regular file below 256 KiB.');input=JSON.parse(readFileSync(fd,'utf8'));}
 finally{closeSync(fd);}
 const scenario=validateScenario(input);if(assignments)validateAssignments(assignments,scenario);return scenario;
}
async function livePage(config,params){
 const response=await fetch(config.url+'/view?'+params,{headers:{authorization:`Bearer ${config.token}`},redirect:'error',signal:AbortSignal.timeout(3000)});
 let size=0;const parts=[];for await(const part of response.body){size+=part.length;if(size>65536)throw problem('Sim view exceeded its output limit.');parts.push(part);}
 let body;try{body=JSON.parse(Buffer.concat(parts));}catch{throw problem('Sim hub returned an invalid view.');}
 if(!response.ok)throw problem(response.status===409?'Run changed. Reload the view.':'Sim view refused.',response.status);
 if(body.schema!=='ai.toolsenabled/sim-view/v1')throw problem('Update the Sim hub and plugin together for views.');return body;
}
function offline(root,identity,params){
 root=privateRoot(root);const names=runNames(root);let pointer;
 try{pointer=privateJSON(join(root,'current-run.json'),16384);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(pointer&&(pointer.schema!=='ai.toolsenabled/sim-current/v1'||!names.includes(pointer.run)))throw problem('Current-run pointer is unavailable.');
 const run=params.get('run')||pointer?.run;
 if(run&&!names.includes(run))throw problem('Run is unavailable.');
 let sim,live;
 if(run){const {header,last}=ends(join(root,run,'trajectory.jsonl'));
  sim={header,status:()=>({...last.status,deliveryRule,deliveryAreas:deliveryAreas(header.scenario.zones)}),snapshot:()=>last};
  if(run===pointer?.run&&pointer.live)live={viewStatus:()=>({...pointer.live,remainingMs:0})};
 }
 return readView({root,sim,live,run,instanceId:pointer?.instanceId,online:false},identity,params);
}
export async function getView({params,connection,root,check}){
 const view=params.get('view')||'status';
 if(view==='help')return staticView('help',helpRows().map(r=>({...r,lines:r.lines.map(s=>s.replace('<sim-dir>',shell(pluginRoot.replace(/\/$/,''))))})),params);
 if(connection&&!isAbsolute(connection))throw problem('SIM_CONNECTION must be an absolute private connection file.');
 if(root&&!isAbsolute(root))throw problem('SIM_RUN_ROOT / --root must be absolute.');
 let config,identity={role:'observer',agentId:'unbound'},connectionState='not configured',connectionValid=false;
 if(connection){try{
   config=JSON.parse(readConnection(connection));const u=new URL(config.url);
   if(u.hostname!=='127.0.0.1'||u.protocol!=='http:'||u.pathname!=='/'||u.username||u.password||u.search||u.hash||!u.port||!/^[a-f0-9]{64}$/.test(config.token)||!['robot','coordinator'].includes(config.role)||typeof config.agentId!=='string'||config.role==='robot'&&typeof config.robotId!=='string')throw problem('Invalid connection.');
   identity={role:config.role,agentId:config.agentId,...(config.role==='robot'?{robotId:config.robotId}:{})};connectionValid=true;connectionState='owner, 0600 mode and parent checks passed';
  }catch(e){connectionState=e.code==='ENOENT'?'missing (normal after clean shutdown)':'owner, mode or contents refused';if(view!=='connection'&&e.code!=='ENOENT')throw problem('The configured private Sim connection is unavailable. Check its owner, mode and path.');}
 }
 let page,liveFailure=false;
 if(config&&connectionValid){try{page=await livePage(config,params);}catch(e){if(e.status){if(view!=='connection')throw e;connectionState='hub refused the view';}else liveFailure=true;}}
 if(!root&&connection){try{const candidate=privateRoot(dirname(connection));privateJSON(join(candidate,'current-run.json'),16384);root=candidate;}catch{}}
 if(!page&&root&&view!=='connection')page=offline(root,identity,params);
 if(view==='connection'){
  const rows=[row('file','Configured private connection',[`Path: ${connection||'not configured'}`,`Checks: ${connectionState}`]),row('runtime','Runtime',[`Node: ${process.versions.node} · ${Number(process.versions.node.split('.')[0])>=22?'supported':'requires Node 22 or later'}`,`Plugin: ${packageVersion}`]),row('hub','Hub reachability',[`Reachable: ${!!page}`,`Mode: ${page?.mode||'unknown'}`,`Role: ${page?.whoami?.role||'unconfirmed'}`,`Agent: ${page?.whoami?.agentId||'unconfirmed'}`,`Robot: ${page?.whoami?.robotId||'none'}`])];
  return staticView(view,rows,params,{online:!!page,mode:page?.mode||null,whoami:page?.whoami||{role:'observer',agentId:'unbound',active:false},summary:['Connection diagnostics · token and endpoint omitted']});
 }
 if(!page)throw problem(liveFailure?'Sim hub is unavailable. Set an explicit private --root for offline history.':'Set SIM_CONNECTION to the absolute private connection file, or SIM_RUN_ROOT / --root for offline history.');
 if(check){if(view!=='scenarios')throw problem('--check is only valid for scenarios.');
  const scenario=readScenario(check,page.actionContext?.assignments);const rows=[row('validation','Scenario valid',[scenarioSummary(scenario),page.actionContext?.assignments?'Current assignments also validate.':'Scene validates; assignment compatibility requires the coordinator.'])];
  page={...page,...paged(rows,{offset:0,limit:10},[view,scenario]),limit:10};
 }
 if(view==='replay'&&root){privateRoot(root);if(!runNames(root).includes(page.run))throw problem('Run is unavailable.');
  const runDir=join(root,page.run);page.rows=page.rows.map(r=>({...r,lines:[...r.lines.filter(s=>!s.startsWith('Run tools/')),
   `node ${shell(join(pluginRoot,'tools/replay.mjs'))} ${shell(runDir)}`,
   `node ${shell(join(pluginRoot,'tools/capture.mjs'))} --run ${shell(runDir)} --output '<new-absolute-directory>' --cameras overview`,
  ]}));
 }else if(view==='replay')page.rows[0]?.lines.push('For exact paths, configure run_root on the hub account; copied connection files do not reveal the run directory.');
 return page;
}
export async function preflight(input,options){
 const refused=reason=>({schema:'ai.toolsenabled/sim-action/v1',allowed:false,reason});
 try{
  if(!input||Object.keys(input).some(k=>!['verb','args'].includes(k))||!actions.includes(input.verb)||!Array.isArray(input.args)||input.args.length>4||input.args.some(a=>!['string','number'].includes(typeof a)||String(a).length>4096||/[\p{Cc}\p{Cf}\p{Cs}]/u.test(String(a))))return refused('Invalid Sim action arguments.');
  const page=await getView({...options,params:new URLSearchParams({view:'status'})});
  if(!page.online)return refused('Actions require the running hub and this session’s own connection.');
  const {verb}=input,args=input.args.slice(),who=page.whoami,context=page.actionContext,mode=page.mode;
  const coordinator=who.role==='coordinator';
  if(['reset','scenario','step','assign'].includes(verb)&&!coordinator)return refused('This action belongs to the coordinator.');
  if(['step','assign'].includes(verb)&&mode!=='manual')return refused('This action requires a manual-mode coordinator.');
  if(context.stopped&&!['reset','scenario'].includes(verb))return refused('The run has stopped. The coordinator can reset it.');
  let robotId=who.robotId;
  if(['deliver','move','hold'].includes(verb)){
   if(coordinator){if(mode!=='manual')return refused('A live coordinator cannot drive robots.');robotId=args.shift();if(!context.robotIds.includes(robotId))return refused('A manual coordinator must give an explicit robot ID.');}
   if(!robotId||!coordinator&&!who.active)return refused('This connection has no active owned robot.');
  }
  if(verb==='submit'&&(coordinator||mode!=='live'||!who.active||page.live.submitted.includes(robotId)))return refused('Submit requires an active, not-yet-submitted owned robot in live mode.');
  const request={verb,mode,...(robotId?{robotId}:{}),...(page.live?{round:page.live.round}:{}),caller:{role:who.role,agentId:who.agentId}};
  if(['deliver','hold','submit','reset'].includes(verb)){if(args.length)return refused('Unexpected arguments for this action.');}
  else if(verb==='move'){
   if(args.length!==2||args.some(v=>!String(v).trim()||!Number.isFinite(Number(v))))return refused('Move needs two finite coordinates.');
   const [x,y]=args.map(Number);if(Math.abs(x)>Math.min(30,context.arena.width/2)||Math.abs(y)>Math.min(30,context.arena.depth/2))return refused('Move coordinates must be inside the arena and within -30…30.');Object.assign(request,{x,y});
  }else if(verb==='step'){
   const n=args.length?Number(args[0]):60;if(args.length>1||!Number.isInteger(n)||n<1||n>60)return refused('Step count must be 1–60.');request.n=n;
  }else if(verb==='assign'){
   if(args.length!==4)return refused('Assign needs robot, crate, task ID and ledger ID.');
   const [robotId,crateId,taskId,ledgerId]=args;validateCall(who,'sim.assign',{robotId,crateId,taskId,ledgerId});
   if(!context.robotIds.includes(robotId)||!context.crateIds.includes(crateId))return refused('Unknown robot or crate.');Object.assign(request,{robotId,crateId,taskId,ledgerId});
  }else if(verb==='scenario'){
   if(args.length!==1)return refused('Scenario needs one absolute JSON file path.');
   const scenario=readScenario(args[0],context.assignments);Object.assign(request,{scenario,assignments:context.assignments});
  }
  return {schema:'ai.toolsenabled/sim-action/v1',allowed:true,request};
 }catch(e){return refused(e.status?e.message:'Sim action preflight failed. Check the private connection and arguments.');}
}
