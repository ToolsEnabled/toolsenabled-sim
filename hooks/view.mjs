import {displayText} from '../src/display.mjs';
import {views,actions,helpRows} from '../src/command-catalog.mjs';
export {views,actions};
export const usage='Views: /sim help|status|robots|map|runs|events|scenarios|replay|connection. Actions: /toolsenabled-sim:deliver, :move, :hold, :submit, :step, :assign, :scenario, :reset (see /sim help for full names and role gates).';
const id=s=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(s);
const coordinate=s=>/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)&&Math.abs(+s)<=30;
export function commandInput(input){
 if(typeof input!=='string'||input.length>4096||/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(input))return null;
 const parts=input.trim().split(/ +/),verb=parts.shift()||'status';
 if(views.includes(verb)){
  if(['events','replay'].includes(verb)&&parts.length===1&&/^run-\d{4,10}$/.test(parts[0]))return {kind:'view',verb,run:parts[0]};
  if(verb==='scenarios'&&parts.length&&parts.join(' ').startsWith('/'))return {kind:'view',verb,check:parts.join(' ')};
  return parts.length?null:{kind:'view',verb};
 }
 if(['deliver','hold'].includes(verb)&&parts.length<=1&&(!parts.length||id(parts[0])))return {kind:'action',verb,args:parts};
 if(['submit','reset'].includes(verb)&&!parts.length)return {kind:'action',verb,args:[]};
 if(verb==='step'&&parts.length<=1&&(!parts.length||/^\d+$/.test(parts[0])&&+parts[0]>=1&&+parts[0]<=60))return {kind:'action',verb,args:parts.map(Number)};
 if(verb==='move'&&(parts.length===2||parts.length===3&&id(parts[0]))&&parts.slice(-2).every(coordinate))return {kind:'action',verb,args:[...(parts.length===3?[parts[0]]:[]),...parts.slice(-2).map(Number)]};
 if(verb==='assign'&&parts.length===4&&parts.slice(0,2).every(id)&&parts.slice(2).every(s=>/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(s)))return {kind:'action',verb,args:parts};
 if(verb==='scenario'&&parts.length&&parts.join(' ').startsWith('/'))return {kind:'action',verb,args:[parts.join(' ')]};
 return null;
}
export function localHelp(query={}){
 const rows=helpRows(),offset=Number(query.offset)||0;
 return {schema:'ai.toolsenabled/sim-view/v1',view:'help',run:null,stream:'all',identity:{role:'observer',agentId:'unbound'},summary:['Commands · role checks precede model actions','Codex <sim-dir> is the absolute installed plugin directory.'],limit:10,revision:'static-help-v1',rows:rows.slice(offset,offset+10),offset,total:rows.length,nextOffset:offset+10<rows.length?offset+10:null,nextCursor:null};
}
export function parsePage(value,view){
 if(!value||value.schema!=='ai.toolsenabled/sim-view/v1'||value.view!==view||!views.includes(view)||!(/^[a-f0-9]{64}$/.test(value.revision)||view==='help'&&value.revision==='static-help-v1')||value.run!==null&&!/^run-\d{4,10}$/.test(value.run))throw new Error('Invalid Sim page');
 const integer=v=>Number.isSafeInteger(v)&&v>=0;
 if(!integer(value.offset)||!integer(value.limit)||value.limit<1||value.limit>10||!Array.isArray(value.rows)||value.rows.length>value.limit||!Array.isArray(value.summary)||value.summary.length>12)throw new Error('Invalid Sim page');
 if(value.nextOffset!==null&&(!integer(value.nextOffset)||value.nextOffset<=value.offset)||value.nextCursor!==null&&!(typeof value.nextCursor==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value.nextCursor))||value.total!==null&&!integer(value.total))throw new Error('Invalid Sim page');
 if(!['all','actions','rounds'].includes(value.stream)||!['observer','coordinator','robot'].includes(value.identity?.role))throw new Error('Invalid Sim page');
 const summary=value.summary.map(t=>{if(typeof t!=='string')throw new Error('Invalid Sim page');return displayText(t,1000);});
 const rows=value.rows.map(r=>{
  if(typeof r.id!=='string'||r.id.length>128||typeof r.title!=='string'||!Array.isArray(r.lines)||r.lines.length>20||r.lines.some(t=>typeof t!=='string'))throw new Error('Invalid Sim row');
  return {id:r.id,title:displayText(r.title),lines:r.lines.map(t=>displayText(t,1000))};
 });
 return {view,run:value.run,stream:value.stream,revision:value.revision,offset:value.offset,total:value.total,nextOffset:value.nextOffset,nextCursor:value.nextCursor,summary,rows};
}
export function detailLines(row){
 const lines=[];for(const text of [row.title,...row.lines]){const points=Array.from(text);for(let i=0;i<points.length;i+=64)lines.push(points.slice(i,i+64).join(''));}return lines;
}

// The reader's request, written to its standard input. The reader commands in register.tsx are fixed text; everything that
// varies is here: the view (or 'action' with the action's verb and arguments), the configured connection_file and run_root
// paths, and the options the pane needs, as strings.
export function readerRequest(view,connection,root,options={},action){
 return JSON.stringify({view,connection,root,options:Object.fromEntries(Object.entries(options).map(([k,v])=>[k,String(v)])),...(action?{action}:{})});
}
// BusyBox env (Alpine Linux) has no -S: it refuses with its usage error before anything starts.
export const envLacksSplit=/^env: (?:invalid|unrecognized) option/m;
