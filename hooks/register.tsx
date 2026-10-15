import type { Register } from 'claude-code'
import { views, usage, commandInput, parsePage, detailLines, localHelp, readerRequest, envLacksSplit, readerHost } from './view.mjs'

const PANE='toolsenabled-sim-view'
let serial=0,opened=false,loading=false,collision=false
let selectedView='status',selectedRun='',stream='all',error='',hint='',selectedCheck=''
let page:any=null,detail:any=null,detailOffset=0
let history:any[]=[]
let currentQuery:any={}
function clear(){serial++;opened=false;loading=false;page=null;detail=null;error='';hint='';history=[];currentQuery={};detailOffset=0}
function redraw($:any){$.ui.invalidate('ui.render')}
// The mod's one program: the plugin's reader, started in the plugin folder by a fixed command. env -i empties the environment
// before Node starts, so the reader gets PATH and LANG and nothing else from Claude Code (no Node settings such as NODE_OPTIONS);
// -S fills in PATH from Claude Code's own environment, so node is found where Claude Code finds it. The request goes to standard input.
async function reader($:any,request:string){
 const init={cwd:$.plugin.root,stdin:request,timeoutMs:12000}
 if(readerHost($.plugin.root)==='windows')return $.process.run(['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe','-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','native/windows-pane.ps1'],init)
 const result=await $.process.run(['/usr/bin/env','-i','-S','PATH=${PATH}:/usr/local/bin:/usr/bin:/bin','LANG=C.UTF-8','node','tools/sim-view.mjs','--pane'],init)
 // An env without -S (BusyBox, as on Alpine Linux) refuses before anything starts: the same reader, with the standard PATH.
 if(result.exitCode!==0&&!result.stdout&&envLacksSplit.test(String(result.stderr||'')))return $.process.run(['/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','LANG=C.UTF-8','node','tools/sim-view.mjs','--pane'],init)
 return result
}
async function close($:any){clear();await $.ui.close({id:PANE})}
async function load($:any,connection:string,root:string,query:any={}){
 const mine=++serial;loading=true;error='';hint='';page=null;detail=null;detailOffset=0;currentQuery=query;redraw($)
 try{
  if(selectedView==='help'){page=parsePage(localHelp(query),'help');return}
  const options={...(selectedView==='events'?{stream}:{}),
   ...(['events','replay'].includes(selectedView)&&selectedRun?{run:selectedRun}:{}),
   ...(selectedView==='scenarios'&&selectedCheck?{check:selectedCheck}:{}),
   ...query}
  const result=await reader($,readerRequest(selectedView,connection,root,options))
  if(mine!==serial||!opened)return
  if(result.exitCode!==0||result.isStdoutTruncated||result.isStderrTruncated){
   const stderr=String(result.stderr||'')
   error=/Run changed/.test(stderr)?'Run changed. Reload to read the current page.':/Update the Sim hub/.test(stderr)?'Update the Sim hub and plugin together for views.':'Sim view unavailable. Check the running hub and configured private connection.'
   return
  }
  if(typeof result.stdout!=='string'||result.stdout.length>65536)throw new Error('Invalid view')
  page=parsePage(JSON.parse(result.stdout),selectedView)
 }catch{if(mine===serial&&opened)error='Sim view unavailable. Reload to try again.'}
 finally{if(mine===serial&&opened){loading=false;redraw($)}}
}
function notice($:any,text:string){hint=text;redraw($)}
async function paneKey($:any,key:string,connection:string,root:string){
 if(!opened)return
 if(key==='q'){await close($);return}
 if(loading){notice($,'The view is loading. Press q or Esc to close.');return}
 if(key==='p'||key==='n'){
  if(detail){const lines=detailLines(detail);if(key==='p'&&detailOffset>0){detailOffset=Math.max(0,detailOffset-12);hint='';redraw($)}else if(key==='n'&&detailOffset+12<lines.length){detailOffset+=12;hint='';redraw($)}else notice($,key==='p'?'No previous detail page.':'No next detail page.');return}
  if(key==='p'&&history.length){await load($,connection,root,history.pop());return}
  if(key==='n'&&page&&(page.nextOffset!==null||page.nextCursor!==null)){const current=page;history.push(currentQuery);await load($,connection,root,{...(current.nextOffset!==null?{offset:current.nextOffset}:{cursor:current.nextCursor}),revision:current.revision});return}
  notice($,key==='p'?'No previous page.':'No next page.');return
 }
 if(key==='r'){if(selectedView==='help'||detail){notice($,selectedView==='help'?'Help is static.':'Return to the list to reload.');return}history=[];await load($,connection,root);return}
 if(key==='h'){if(selectedView==='help'&&!detail){notice($,'Help is already open.');return}selectedView='help';history=[];await load($,connection,root);return}
 if(key==='b'){if(detail){detail=null;detailOffset=0;hint='';redraw($)}else notice($,'Select a row to open its detail.');return}
 if(key==='e'){if(detail&&selectedView==='runs'&&/^run-\d{4,10}$/.test(detail.id)){selectedRun=detail.id;selectedView='events';stream='all';history=[];await load($,connection,root)}else notice($,'Open a retained run detail to see its events.');return}
 if(key==='a'){if(selectedView==='events'&&!detail){stream=stream==='all'?'actions':stream==='actions'?'rounds':'all';history=[];await load($,connection,root)}else notice($,'Event stream selection is available in the events list.');return}
 if(/^[0-9]$/.test(key)){const index=(Number(key)+9)%10;if(!detail&&page?.rows[index]){detail=page.rows[index];detailOffset=0;hint='';redraw($)}else notice($,`Row ${key} is not available in this view.`)}
}
const unavailable='Sim action unavailable. Check this session’s private connection.'
// An action's checks before any model turn: its refusal, answered as the command's own output, or null.
async function actionRefusal($:any,verb:string,e:any,connection:string,root:string){
 const command=commandInput(verb+(e.args?' '+e.args:''))
 if(!command||command.kind!=='action')return {text:usage}
 // The model reads the typed scenario path, so it must be exactly the path the preflight opens.
 if(verb==='scenario'&&e.args.trim()!==command.args[0])return {text:usage}
 // Only the person's own prompt, at this terminal or through Remote Control, starts a Sim action.
 if(!['composer','bridge'].includes(e.origin.kind))return {text:'Type the Sim action yourself to request it.'}
 const actionEpoch=++serial
 let plan:any
 try{
  const result=await reader($,readerRequest('action',connection,root,{},{verb,args:command.args}))
  if(result.exitCode!==0||result.isStdoutTruncated||result.isStderrTruncated||result.stdout.length>65536)throw new Error('preflight')
  if(actionEpoch!==serial)return {text:'Sim action cancelled.'}
  plan=JSON.parse(result.stdout)
  if(plan.schema!=='ai.toolsenabled/sim-action/v1'||typeof plan.allowed!=='boolean')throw new Error('preflight')
 }catch{plan={allowed:false,reason:unavailable}}
 if(!plan.allowed){
  clear();opened=true;selectedView='status';error=typeof plan.reason==='string'?plan.reason.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'?').slice(0,240):'Action refused.'
  await $.ui.open({id:PANE,title:'Sim',focus:true,closeOnEscape:true,holdToasts:true,rows:22,columns:90});redraw($)
  return {text:'Sim pane opened.'}
 }
 if(!plan.request||plan.request.verb!==verb)return {text:'Sim action preflight returned invalid data.'}
 return null
}
// A failed action hook refuses rather than skip the checks; a command it already passed on is replayed unchanged.
function failedAction($:any,e:any,next:any){return next.called?next(e):{text:unavailable}}
export const register: Register = (on,options) => {
 const connection=String(options.connection_file||''),root=String(options.run_root||'')
 // The eight actions are this plugin's own Markdown commands (commands/<verb>.md). A refused action is
 // answered here and never runs. Otherwise the event goes on unchanged: the command runs exactly as typed,
 // and its prompt keeps the normal tool approvals.
 on('command.run',{command:'toolsenabled-sim:deliver'},async($,e,next)=>{const refused=await actionRefusal($,'deliver',e,connection,root);if(refused)return refused;return next(e)}).catch(failedAction)
 on('command.run',{command:'toolsenabled-sim:move'},async($,e,next)=>{const refused=await actionRefusal($,'move',e,connection,root);if(refused)return refused;return next(e)}).catch(failedAction)
 on('command.run',{command:'toolsenabled-sim:hold'},async($,e,next)=>{const refused=await actionRefusal($,'hold',e,connection,root);if(refused)return refused;return next(e)}).catch(failedAction)
 on('command.run',{command:'toolsenabled-sim:submit'},async($,e,next)=>{const refused=await actionRefusal($,'submit',e,connection,root);if(refused)return refused;return next(e)}).catch(failedAction)
 on('command.run',{command:'toolsenabled-sim:step'},async($,e,next)=>{const refused=await actionRefusal($,'step',e,connection,root);if(refused)return refused;return next(e)}).catch(failedAction)
 on('command.run',{command:'toolsenabled-sim:assign'},async($,e,next)=>{const refused=await actionRefusal($,'assign',e,connection,root);if(refused)return refused;return next(e)}).catch(failedAction)
 on('command.run',{command:'toolsenabled-sim:scenario'},async($,e,next)=>{const refused=await actionRefusal($,'scenario',e,connection,root);if(refused)return refused;return next(e)}).catch(failedAction)
 on('command.run',{command:'toolsenabled-sim:reset'},async($,e,next)=>{const refused=await actionRefusal($,'reset',e,connection,root);if(refused)return refused;return next(e)}).catch(failedAction)
 on('session.start',async($,e,next)=>{
  clear();collision=(await $.command.list()).some(c=>c.name==='sim'&&!(c.source==='plugin'&&c.plugin==='toolsenabled-sim'))
  if(!collision)await $.command.register({name:'sim',description:'Read Sim state, robots, history and help in a local pane',argumentHint:'[status|help|robots|map|runs|events|scenarios|replay|connection]'})
  return next(e)
 })
 on('session.end',async($,e,next)=>{clear();return next(e)})
 on('ui.close',{id:PANE},async($,e,next)=>{clear();return next(e)}).catch(($,e,next)=>next(e))
 on('command.run',{command:'sim'},async($,e,next)=>{
  if(collision)return next(e)
  const command=commandInput(e.args);if(!command)return {text:usage}
  if(command.kind==='action'){
   return {text:`Use /toolsenabled-sim:${command.verb}${command.args.length?' '+command.args.join(' '):''} to request this action.`}
  }
  clear();opened=true;selectedView=command.verb;selectedRun=command.run||'';selectedCheck=command.check||'';stream='all'
  await $.ui.open({id:PANE,title:'Sim',focus:true,closeOnEscape:true,holdToasts:true,rows:22,columns:90})
  await load($,connection,root)
  // Runtime data stays in the pane and never becomes a model context message.
  return {text:'Sim pane opened.'}
 }).catch(($,e,next)=>next.called?next(e):{text:'Sim pane unavailable. Run /sim again to retry.'})
 on('ui.render',{component:'Pane',requestId:PANE},async($,e)=>{
  const {Box,Text,Button}=$.ui.resolve(e),current=page,chosen=detail
  if(!opened)return <Text>Sim pane closed.</Text>
  const lines=chosen?detailLines(chosen):[],ready=!loading
  const previous=ready&&(chosen?detailOffset>0:history.length>0)
  const next=ready&&(chosen?detailOffset+12<lines.length:!!current&&(current.nextOffset!==null||current.nextCursor!==null))
  const reload=ready&&!chosen&&selectedView!=='help',help=ready&&(!!chosen||selectedView!=='help')
  const back=ready&&!!chosen,events=ready&&!!chosen&&selectedView==='runs'&&/^run-\d{4,10}$/.test(chosen.id),cycle=ready&&!chosen&&selectedView==='events'
  const keys=[...(previous?['p previous']:[]),...(next?['n next']:[]),...(reload?['r reload']:[]),...(help?['h help']:[]),...(back?['b back']:[]),...(events?['e events']:[]),...(cycle?['a stream']:[]),...(!chosen&&ready&&current?.rows.length?[`rows ${current.rows.map((_:any,i:number)=>String((i+1)%10)).join(',')}`]:[]),'q / Esc close']
  return <Box flexDirection="column">
   <Text bold>Sim · {selectedView}{chosen?' · detail':selectedView==='events'?` · ${stream}`:''}</Text>
   {chosen?lines.slice(detailOffset,detailOffset+12).map((line:string)=><Text>{line}</Text>):<Box flexDirection="column">
    {current?<Text dimColor>Revision {current.revision.slice(0,12)}</Text>:null}
    {current?.summary.map((line:string)=><Text dimColor>{line}</Text>)}
    {loading?<Text dimColor>Loading…</Text>:error?<Text>{error}</Text>:null}
    {current&&!current.rows.length?<Text>No visible records on this page.</Text>:null}
    {current?.rows.map((r:any,i:number)=><Button key={`sim-row-${i}`} onPress={()=>{if(page!==current||loading)return;detail=r;detailOffset=0;hint='';redraw($)}}>{`${(i+1)%10}: ${r.title.slice(0,61)}`}</Button>)}
    {current?.total!==null&&current?.total!==undefined?<Text dimColor>{current.offset+1}–{current.offset+current.rows.length} of {current.total}</Text>:null}
   </Box>}
   {hint?<Text dimColor>{hint}</Text>:null}
   <Box>
    <Button key="sim-prev" hotkey="p" dimColor={!previous} onPress={async()=>{await paneKey($,'p',connection,root)}}>Previous</Button>
    <Button key="sim-next" hotkey="n" dimColor={!next} onPress={async()=>{await paneKey($,'n',connection,root)}}>Next</Button>
    <Button key="sim-reload" hotkey="r" dimColor={!reload} onPress={async()=>{await paneKey($,'r',connection,root)}}>Reload</Button>
    <Button key="sim-help" hotkey="h" dimColor={!help} onPress={async()=>{await paneKey($,'h',connection,root)}}>Help</Button>
    <Button key="sim-back" hotkey="b" dimColor={!back} onPress={async()=>{await paneKey($,'b',connection,root)}}>Back</Button>
    <Button key="sim-run-events" hotkey="e" dimColor={!events} onPress={async()=>{await paneKey($,'e',connection,root)}}>Events</Button>
    <Button key="sim-stream" hotkey="a" dimColor={!cycle} onPress={async()=>{await paneKey($,'a',connection,root)}}>Stream</Button>
    <Button key="sim-close" hotkey="q" onPress={async()=>{await close($)}}>Close</Button>
   </Box>
   <Box><Text dimColor>Rows </Text>{Array.from({length:10},(_:any,i:number)=>String((i+1)%10)).map((key:string)=><Button key={`sim-digit-${key}`} hotkey={key} dimColor={!ready||!!chosen||!current?.rows[(Number(key)+9)%10]} onPress={async()=>{await paneKey($,key,connection,root)}}>{key}</Button>)}</Box>
   {!chosen&&ready?<Box>{views.map((v:string)=><Button key={`sim-view-${v}`} onPress={async()=>{selectedView=v;selectedRun='';selectedCheck='';stream='all';history=[];await load($,connection,root)}}>{v}</Button>)}</Box>:null}
   <Text dimColor>Keys: {keys.join(' · ')}</Text>
   <Text dimColor>Read-only · Dim controls explain why they are unavailable.</Text>
  </Box>
 })
}
