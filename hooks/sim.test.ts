import { test, expect } from 'claude-code/testing'
import { actions } from './view.mjs'

const options={connection_file:'/private/run/connection-amber.json'}
// 0.1.12: the two reader commands, as fixed text (the directory holds a command it cannot read in full). Everything that
// varies is in the JSON request on standard input. test/pane-env.test.mjs runs both commands for real.
const READER=['/usr/bin/env','-i','-S','PATH=${PATH}:/usr/local/bin:/usr/bin:/bin','LANG=C.UTF-8','node','tools/sim-view.mjs','--pane']
const BUSYBOX_READER=['/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','LANG=C.UTF-8','node','tools/sim-view.mjs','--pane']
const presentation={isFullscreen:false,columns:120}
function frame(view='status',offset=0){return {schema:'ai.toolsenabled/sim-view/v1',view,run:'run-0001',stream:'actions',identity:{role:'robot',agentId:'agent-amber',robotId:'amber'},summary:['Run run-0001 · live'],limit:10,revision:'a'.repeat(64),rows:[{id:view==='runs'?'run-0001':'amber',title:'Visible result',lines:['Caller: robot / agent-amber']}],offset,total:21,nextOffset:offset<20?offset+10:null,nextCursor:null}}
function world(on:any){
 const processes:any[]=[],prompts:any[]=[],commands:any[]=[],opened:any[]=[],closed:any[]=[],native:any[]=[]
 let answer:any=frame(),failure='',raw:any=null,truncated=false,builtin=false,pending:any=null,started:any=null,resume:any=null,uiFails=false,envRefusal=''
 on('session.start',(_:any,e:any)=>({cwd:e.cwd}))
 on('session.end',(_:any,e:any)=>({sessionId:e.sessionId}))
 on('session.version',()=>({value:{version:'2.1.287'}}))
 on('command.list',()=>({value:[{name:'status',source:'builtin',description:'Status'},...(builtin?[{name:'sim',source:'builtin',description:'Reserved'}]:[])]}))
 on('command.register',(_:any,e:any)=>{commands.push(e);return {value:{command:e.name}}})
 on('command.run',(_:any,e:any)=>{native.push(e);return {text:'native command ran',context:['native prompt retained']}})
 on('ui.open',(_:any,e:any)=>{if(uiFails)throw new Error('No surface');opened.push(e);return {value:{isPlaced:true}}})
 on('ui.close',(_:any,e:any)=>{closed.push(e);return {value:undefined}})
 on('ui.toast',()=>({value:undefined}))
 on('process.run',async(_:any,e:any)=>{processes.push(e);if(envRefusal&&e.argv[2]==='-S')return {value:{exitCode:1,stdout:'',stderr:envRefusal,isStdoutTruncated:false,isStderrTruncated:false}};if(pending){started();await pending}return {value:{exitCode:failure?1:0,stdout:failure?'':raw??JSON.stringify(answer),stderr:failure,isStdoutTruncated:truncated,isStderrTruncated:false}}})
 on('prompt.submit',(_:any,e:any)=>{prompts.push(e);return {text:e.text}})
 on('tool.call',()=>{throw new Error('No direct tool calls')})
 on('mcp.call',()=>{throw new Error('No pane MCP calls')})
 on('ui.status',()=>{throw new Error('No startup warning/status line')})
 return {processes,prompts,commands,opened,closed,native,defer:()=>{const ready=new Promise(r=>started=r);pending=new Promise(r=>resume=r);return ready},release:()=>{resume();pending=null},setAnswer:(a:any)=>{answer=a;raw=null;truncated=false},setRaw:(r:string,t=false)=>{raw=r;truncated=t},setFailure:(e:string)=>failure=e,setBuiltin:()=>builtin=true,failUi:()=>uiFails=true,refuseSplit:(text:string)=>envRefusal=text}
}
async function start($:any){await $.session.start({cwd:'/project',surface:'terminal',isInteractive:true})}
async function command($:any,args:string,kind='composer'){return $.command.run({command:'sim',args,origin:{kind},presentation})}
async function pane($:any){return $.ui.mount({plugin:'toolsenabled-sim',surface:'terminal',component:'Pane',requestId:'toolsenabled-sim-view',props:{title:'Sim',bodyColumns:100},viewport:{columns:120,rows:24}})}
async function press($:any,key:string){await $.ui.press({plugin:'toolsenabled-sim',key,requestId:'toolsenabled-sim-view',surface:'terminal'})}

test('registers only /sim at neutral startup without reads or prompts',{options},async($,on)=>{
 const w=world(on);await start($);expect(w.commands.map(c=>c.name)).toEqual(['sim']);expect(w.processes.length).toBe(0);expect(w.prompts.length).toBe(0)
})
for(const view of ['status','robots','runs','events','map','scenarios','replay','connection'])test(`${view} opens a local read-only pane and q closes`,{options},async($,on)=>{
 const w=world(on);w.setAnswer(frame(view));await start($);const result=await command($,view==='status'?'':view)
 expect(result.text).toBe('Sim pane opened.');expect(result.context).toBe(undefined);expect(w.processes.length).toBe(1)
 const call=w.processes[0];expect(call.argv).toEqual(READER);expect(call.init.cwd).toMatch(/^\//);expect(call.init.env).toBe(undefined);expect(call.init.timeoutMs).toBe(5000)
 expect(JSON.parse(call.init.stdin)).toEqual({view,connection:options.connection_file,root:'',options:view==='events'?{stream:'all'}:{}})
 const ui=await pane($);expect(JSON.stringify(await ui.drawn())).toContain('Visible result')
 expect(w.opened[0].closeOnEscape).toBe(true);await press($,'sim-close');expect(w.closed.length).toBe(1);expect(w.prompts.length).toBe(0)
})
// 0.1.12: run_root reaches the reader in the request, and a BusyBox env without -S gets the same reader once more.
test('the configured run_root reaches the reader in its request, never in its command',{options:{...options,run_root:'/private/run'}},async($,on)=>{
 const w=world(on);await start($);await command($,'runs');expect(w.processes[0].argv).toEqual(READER)
 expect(JSON.parse(w.processes[0].init.stdin)).toEqual({view:'runs',connection:options.connection_file,root:'/private/run',options:{}})
})
for(const refusal of ["env: invalid option -- 'S'\nBusyBox v1.36.1 multi-call binary.\n",'env: unrecognized option: S\nUsage: env [-i0] [-u NAME]... [-] [NAME=VALUE]... [PROG ARGS]\n'])test(`an env without -S runs the same reader with the standard PATH: ${refusal.split('\n')[0]}`,{options},async($,on)=>{
 const w=world(on);w.refuseSplit(refusal);await start($);await command($,'status');const ui=await pane($)
 expect(w.processes.map((p:any)=>p.argv)).toEqual([READER,BUSYBOX_READER]);expect(w.processes[1].init).toEqual(w.processes[0].init);expect(JSON.stringify(await ui.drawn())).toContain('Visible result')
 const event={command:'toolsenabled-sim:step',args:'1',origin:{kind:'composer'},presentation}
 w.setAnswer({schema:'ai.toolsenabled/sim-action/v1',allowed:true,request:{verb:'step',mode:'manual',caller:{role:'coordinator',agentId:'coordinator'}}});await press($,'sim-close');await $.command.run(event)
 expect(w.processes.slice(2).map((p:any)=>p.argv)).toEqual([READER,BUSYBOX_READER]);expect(w.native).toEqual([event])
})
test('a reader failure that is not env\'s own refusal is not retried',{options},async($,on)=>{
 const w=world(on);w.setFailure('Sim view failed. Check arguments, private file ownership and configuration.');await start($);await command($,'status')
 expect(w.processes.length).toBe(1);const ui=await pane($);expect(JSON.stringify(await ui.drawn())).toContain('unavailable')
})
test('row details stay local and paging keeps the revision',{options},async($,on)=>{
 const w=world(on);w.setAnswer(frame('runs'));await start($);await command($,'runs');const ui=await pane($)
 await press($,'sim-row-0');expect(JSON.stringify(await ui.drawn())).toContain('Caller: robot / agent-amber');expect(w.processes.length).toBe(1)
 await press($,'sim-back');w.setAnswer(frame('runs',10));await press($,'sim-next')
 expect(w.processes[1].argv).toEqual(READER);expect(JSON.parse(w.processes[1].init.stdin)).toEqual({view:'runs',connection:options.connection_file,root:'',options:{offset:'10',revision:'a'.repeat(64)}})
 expect(w.prompts.length).toBe(0)
})
// fresh-user-7 Sim #8: /sim and the pane's ui.close were gating hooks without .catch; a failing /sim hook now answers itself.
test('a /sim hook that fails answers with fixed text and never reaches a native command',{options},async($,on)=>{
 const w=world(on);w.failUi();await start($);const result=await command($,'status')
 expect(result.text).toBe('Sim pane unavailable. Run /sim again to retry.');expect(w.native.length).toBe(0);expect(w.prompts.length).toBe(0)
})
test('errors are plain, retry is explicit and close clears the old data',{options},async($,on)=>{
 const w=world(on);w.setFailure('Error at /private/hidden-path\nstack');await start($);await command($,'status');const ui=await pane($)
 const drawn=JSON.stringify(await ui.drawn());expect(drawn).toContain('unavailable');expect(drawn.includes('hidden-path')).toBe(false)
 expect(w.processes.length).toBe(1);await press($,'sim-close');expect(w.prompts.length).toBe(0)
})
test('terminal controls are rendered as visible escapes, never emitted raw',{options},async($,on)=>{
 const w=world(on);const value=frame('events');value.rows[0].title='evil\u001b]52;c;x\u0007\u202e';w.setAnswer(value)
 await start($);await command($,'events');const ui=await pane($);const text=JSON.stringify(await ui.drawn())
 expect(text.includes('\\\\u001b')).toBe(true);expect(w.prompts.length).toBe(0)
})
// Every sanitizer class the reader can forward: C0, C1, bidi isolates and overrides, zero-width
// and format characters, line and paragraph separators, lone surrogates and a tag character.
const HOSTILE='A\u0000\u0007\u001b]52;c;x\u0007B\u009b2J\u0085C\u202e\u2066\u2069D\u200b\u200d\u200e\u2060\ufeff\u00ad\u061cE\u2028\u2029F\ud800G\udfffH\u{e0041}I'
function texts(node:any,out:string[]=[]):string[]{if(typeof node==='string')out.push(node);else if(Array.isArray(node))for(const n of node)texts(n,out);else if(node&&typeof node==='object')for(const [k,v] of Object.entries(node)){if(k!=='press')texts(v,out)}return out}
const unsafe=(tree:any)=>texts(tree).filter(s=>/(?!\n)[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(s))
test('every sanitizer class is escaped and long text is truncated before the pane draws it',{options},async($,on)=>{
 const w=world(on);const value=frame('runs');value.summary=[HOSTILE,'s'.repeat(1001)];value.rows[0].title=HOSTILE+'Visible result';value.rows[0].lines=[HOSTILE,'l'.repeat(1001)];w.setAnswer(value)
 await start($);await command($,'runs');const ui=await pane($)
 let tree=await ui.drawn();expect(unsafe(tree)).toEqual([]);let text=JSON.stringify(tree)
 for(const code of ['0000','001b','0085','009b','202e','2066','200b','2060','feff','00ad','2028','2029','d800','dfff','e0041'])expect(text.includes('\\\\u'+code)).toBe(true)
 expect(text).toContain('[truncated]')
 await press($,'sim-row-0');tree=await ui.drawn();expect(unsafe(tree)).toEqual([]);expect(JSON.stringify(tree).includes('\\\\u200b')).toBe(true)
 for(let i=0;i<5;i++){await press($,'sim-next');expect(unsafe(await ui.drawn())).toEqual([])}
 expect(w.processes.length).toBe(1);expect(w.prompts.length).toBe(0)
})
test('the pane fails closed on oversized, truncated or out-of-bounds reader output',{options},async($,on)=>{
 const w=world(on);await start($)
 const rows=(n:number)=>Array.from({length:n},(_,i)=>({id:'run-'+String(i+1).padStart(4,'0'),title:'Visible result',lines:['l']}))
 const cases:any[]=[
  {...frame('runs'),limit:11,rows:rows(11)},{...frame('runs'),rows:rows(11)},{...frame('runs'),summary:Array.from({length:13},()=>'s')},
  {...frame('runs'),rows:[{id:'x'.repeat(129),title:'Visible result',lines:[]}]},{...frame('runs'),rows:[{id:'r',title:'Visible result',lines:Array.from({length:21},()=>'l')}]},
  {...frame('runs'),revision:'zz'},{...frame('runs'),offset:-1},{...frame('runs'),nextOffset:0},frame('events'),
 ]
 const check=async()=>{await command($,'runs');const ui=await pane($);const text=JSON.stringify(await ui.drawn());expect(text).toContain('unavailable');expect(text.includes('Visible result')).toBe(false);await press($,'sim-close');await ui.unmount()}
 for(const value of cases){w.setAnswer(value);await check()}
 w.setRaw(JSON.stringify(frame('runs'))+' '.repeat(70000));await check()
 w.setRaw(JSON.stringify(frame('runs')),true);await check()
 expect(w.processes.length).toBe(cases.length+2);expect(w.prompts.length).toBe(0);expect(w.native.length).toBe(0)
})
// The preflight only decides whether an action runs. An allowed command goes on as the exact event typed
// (the plugin directory asks command.run hooks to pass events on unchanged); the model reads its bound
// identity from sim.status instead of from rewritten arguments.
for(const action of ['deliver','move 1.25 -2','hold','submit','reset','step 1','assign amber cargo-a task-1 ledger-1','scenario /private/scene.json'])test(`${action} preflights, then runs the native command exactly as typed`,{options},async($,on)=>{
 const w=world(on);await start($);const [verb,...args]=action.split(' ')
 const request={verb,mode:'live',robotId:'amber',round:'1:0',caller:{role:'robot',agentId:'agent-amber'}}
 w.setAnswer({schema:'ai.toolsenabled/sim-action/v1',allowed:true,request})
 const event={command:'toolsenabled-sim:'+verb,args:args.join(' '),origin:{kind:'composer'},presentation}
 const result=await $.command.run(event)
 expect(w.native).toEqual([event]);expect(result.context).toEqual(['native prompt retained']);expect(w.processes.length).toBe(1);expect(w.prompts.length).toBe(0)
 expect(w.processes[0].argv).toEqual(READER);expect(JSON.parse(w.processes[0].init.stdin)).toEqual({view:'action',connection:options.connection_file,root:'',options:{},action:{verb,args:args.map(v=>verb==='move'||verb==='step'?Number(v):v)}})
})
const typed:any={deliver:'',move:'1.25 -2',hold:'',submit:'',step:'1',assign:'amber cargo-a task-1 ledger-1',scenario:'/private/scene.json',reset:''}
test('only the person starts an action: other origins are refused and Remote Control runs it unchanged',{options},async($,on)=>{
 const w=world(on);await start($);const events:any[]=[]
 for(const verb of actions)for(const origin of [{kind:'peer'},{kind:'channel',server:'relay'},{kind:'scheduled-trigger'},{kind:'sdk'},{kind:'unclassified'}]){
  const result=await $.command.run({command:'toolsenabled-sim:'+verb,args:typed[verb],origin,presentation});expect(result.text).toBe('Type the Sim action yourself to request it.')
 }
 expect(w.native.length).toBe(0);expect(w.processes.length).toBe(0);expect(w.prompts.length).toBe(0)
 for(const verb of actions){
  w.setAnswer({schema:'ai.toolsenabled/sim-action/v1',allowed:true,request:{verb,mode:'manual',caller:{role:'coordinator',agentId:'coordinator'}}})
  const event={command:'toolsenabled-sim:'+verb,args:typed[verb],origin:{kind:'bridge'},presentation};events.push(event);await $.command.run(event)
 }
 expect(w.native).toEqual(events);expect(w.processes.length).toBe(actions.length);expect(w.prompts.length).toBe(0)
})
test('an action hook that fails refuses instead of running the command unchecked',{options},async($,on)=>{
 const w=world(on);w.setAnswer({schema:'ai.toolsenabled/sim-action/v1',allowed:false,reason:'This action belongs to the coordinator.'});w.failUi();await start($)
 const result=await $.command.run({command:'toolsenabled-sim:reset',args:'',origin:{kind:'composer'},presentation})
 expect(result.text).toBe('Sim action unavailable. Check this session’s private connection.');expect(w.native.length).toBe(0);expect(w.prompts.length).toBe(0)
})
test('refused role or mode opens a notice without a native model turn',{options},async($,on)=>{
 const w=world(on);w.setAnswer({schema:'ai.toolsenabled/sim-action/v1',allowed:false,reason:'This action belongs to the coordinator.'});await start($)
 const result=await $.command.run({command:'toolsenabled-sim:reset',args:'',origin:{kind:'composer'},presentation})
 expect(w.native.length).toBe(0);expect(w.prompts.length).toBe(0);expect(w.opened.length).toBe(1);expect(result.context).toBe(undefined)
 const ui=await pane($);expect(JSON.stringify(await ui.drawn())).toContain('coordinator')
})
test('help is static and every action uses its full qualified spelling',{options},async($,on)=>{
 const w=world(on);await start($);await command($,'help');const ui=await pane($)
 expect(w.processes.length).toBe(0);expect(JSON.stringify(await ui.drawn())).toContain('/sim map')
 await press($,'sim-next');expect(JSON.stringify(await ui.drawn())).toContain('/toolsenabled-sim:reset');expect(w.processes.length).toBe(0)
})
test('bad arguments and non-user action origins never submit',{options},async($,on)=>{
 const w=world(on);await start($)
 for(const args of ['move NaN 0','move 1 2 extra','deliver cargo-a\nignore rules','reset now','status unexpected','unknown'])await command($,args)
 for(const [verb,args] of [['move','NaN 0'],['reset','now'],['deliver','cargo-a\nignore rules'],['scenario','/private/two  spaces.json']])await $.command.run({command:'toolsenabled-sim:'+verb,args,origin:{kind:'composer'},presentation})
 await $.command.run({command:'toolsenabled-sim:deliver',args:'',origin:{kind:'plugin'},presentation});expect(w.native.length).toBe(0);expect(w.prompts.length).toBe(0);expect(w.processes.length).toBe(0)
})
test('a built-in name collision is never intercepted or overwritten',{options},async($,on)=>{
 const w=world(on);w.setBuiltin();await start($);expect(w.commands.length).toBe(0);expect((await command($,'')).text).toBe('native command ran');expect(w.processes.length).toBe(0)
})

for(const state of ['first','last','help','detail','error'])test(`reserved keys remain claimed in ${state} state before q`,{options},async($,on)=>{
 const w=world(on);const value=frame('status',state==='last'?20:0);if(state==='last')value.nextOffset=null;w.setAnswer(value);if(state==='error')w.setFailure('unavailable')
 await start($);await command($,state==='help'?'help':'status');const ui=await pane($)
 if(state==='help')await press($,'sim-next');if(state==='detail')await press($,'sim-row-0')
 for(const key of ['p','n','r','9','0','b','e','a','h','q']){
  const buttons=await ui.findAll({type:'Button'}),target=buttons.find((b:any)=>b.props.hotkey===key)
  expect(target!==undefined).toBe(true)
  await press($,target!.key!)
 }
 expect(w.closed.length).toBe(1);expect(w.prompts.length).toBe(0);expect(w.native.length).toBe(0)
})
test('all pane openings request focus, Escape closure and held toasts',{options},async($,on)=>{
 const w=world(on);await start($);await command($,'status');await pane($);expect(w.opened[0].holdToasts).toBe(true);expect(w.opened[0].focus).toBe(true)
 await press($,'sim-close');w.setAnswer({schema:'ai.toolsenabled/sim-action/v1',allowed:false,reason:'Refused'})
 await $.command.run({command:'toolsenabled-sim:reset',args:'',origin:{kind:'composer'},presentation})
 expect(w.opened[1].holdToasts).toBe(true);expect(w.opened[1].closeOnEscape).toBe(true)
})

test('loading claims keys, q closes and a late reader cannot reopen it',{options},async($,on)=>{
 const w=world(on);await start($);const ready=w.defer(),request=command($,'status');await ready;const ui=await pane($)
 for(const key of ['p','n','r','9','0','a','b','e','h','q']){const target=(await ui.findAll({type:'Button'})).find((b:any)=>b.props.hotkey===key);expect(target!==undefined).toBe(true);await press($,target!.key!)}
 w.release();await request;expect(w.closed.length).toBe(1);expect(w.opened.length).toBe(1);expect(w.prompts.length).toBe(0)
 // Closing unmounts the host pane; its old test snapshot is no longer redrawn.
 await ui.unmount();const after=await pane($);expect(JSON.stringify(await after.drawn())).toContain('closed')
})
for(const view of ['status','robots','map','runs','events','scenarios','replay','connection'])test(`${view} retains all reserved hotkeys and an unavailable digit gives a hint`,{options},async($,on)=>{
 const w=world(on);const value=frame(view,20);value.nextOffset=null;w.setAnswer(value);await start($);await command($,view);const ui=await pane($)
 const buttons=await ui.findAll({type:'Button'}),keys=buttons.map((b:any)=>b.props.hotkey).filter(Boolean)
 for(const key of ['p','n','r','h','b','e','a','q','1','2','3','4','5','6','7','8','9','0'])expect(keys.includes(key)).toBe(true)
 expect(new Set(keys).size).toBe(keys.length)
 const footer=(await ui.find({type:'Text',text:'Keys:'}))!.text;expect(footer.includes('p previous')).toBe(false);expect(footer.includes('n next')).toBe(false)
 await press($,buttons.find((b:any)=>b.props.hotkey==='9')!.key!);expect(JSON.stringify(await ui.drawn())).toContain('Row 9 is not available')
 await press($,'sim-close');expect(w.closed.length).toBe(1);expect(w.prompts.length).toBe(0)
})
test('help reload and detail reload explain no-op without starting a child',{options},async($,on)=>{
 const w=world(on);await start($);await command($,'help');const ui=await pane($)
 expect((await ui.find({type:'Text',text:'Keys:'}))!.text.includes('r reload')).toBe(false)
 await press($,'sim-reload');expect(JSON.stringify(await ui.drawn())).toContain('Help is static');expect(w.processes.length).toBe(0)
 await press($,'sim-row-0');await press($,'sim-reload');expect(w.processes.length).toBe(0);await press($,'sim-close');expect(w.closed.length).toBe(1)
})
