import {getView,preflight} from '../src/view-client.mjs';
import {displayText} from '../src/display.mjs';

const usage='Use sim-view.mjs help for view and action usage.';
// --pane is the Claude Code mod's fixed reader command (hooks/register.tsx). Everything that varies arrives as one JSON request
// on standard input, at most 64 KiB: {view, connection, root, options} and, for view 'action', the action {verb, args} (at
// most 8 KiB, as before). Options are the flags' names without dashes, as strings. Environment variables are not read.
async function pane(args){
 if(args.length)throw new Error(usage);
 let size=0;const parts=[];for await(const b of process.stdin){size+=b.length;if(size>65536)throw new Error('Pane request exceeds 64 KiB.');parts.push(b);}
 const request=JSON.parse(Buffer.concat(parts)),options=request?.options;
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['view','connection','root','options','action'].includes(k))||
  !['view','connection','root'].every(k=>typeof request[k]==='string')||!options||typeof options!=='object'||Array.isArray(options)||
  Object.entries(options).some(([k,v])=>!['offset','limit','revision','cursor','run','stream','check'].includes(k)||typeof v!=='string')||(request.view==='action')!==('action' in request))throw new Error(usage);
 const {view,connection,root}=request;let body;
 if(view==='action'){if(Buffer.byteLength(JSON.stringify(request.action))>8192)throw new Error('Action input exceeds 8 KiB.');body=await preflight(request.action,{connection,root});}
 else{const {check,...rest}=options;body=await getView({params:new URLSearchParams({view,...rest}),connection,root,check});}
 if(Buffer.byteLength(JSON.stringify(body))>65536)throw new Error('Sim view exceeds its output limit.');
 process.stdout.write(JSON.stringify(body)+'\n');
}
async function main(){
 if(process.argv[2]==='--pane')return pane(process.argv.slice(3));
 const args=process.argv.slice(2),view=args.shift()||'status',params=new URLSearchParams({view});let json=false,connection=process.env.SIM_CONNECTION,root=process.env.SIM_RUN_ROOT,check;
 while(args.length){const flag=args.shift();if(flag==='--json'){json=true;continue;}
  if(!['--offset','--limit','--revision','--cursor','--run','--stream','--connection','--root','--check'].includes(flag)||!args.length)throw new Error(usage);
  const value=args.shift();if(flag==='--connection')connection=value;else if(flag==='--root')root=value;else if(flag==='--check')check=value;else params.set(flag.slice(2),value);
 }
 let body;
 if(view==='action'){
  let size=0,parts=[];for await(const b of process.stdin){size+=b.length;if(size>8192)throw new Error('Action input exceeds 8 KiB.');parts.push(b);}
  body=await preflight(JSON.parse(Buffer.concat(parts)),{connection,root});
 }else body=await getView({params,connection,root,check});
 if(Buffer.byteLength(JSON.stringify(body))>65536)throw new Error('Sim view exceeds its output limit.');
 if(json){process.stdout.write(JSON.stringify(body)+'\n');return;}
 if(view==='action'){process.stdout.write(JSON.stringify(body)+'\n');return;}
 process.stdout.write([...body.summary,`Revision ${body.revision}`,'',...body.rows.flatMap(r=>[r.title,...r.lines.map(t=>'  '+t),'']),
  ...(body.nextOffset!==null?[`Next page: --offset ${body.nextOffset} --revision ${body.revision}`]:[]),
  ...(body.nextCursor!==null?[`Next page: --cursor ${body.nextCursor} --revision ${body.revision}`]:[]),
 ].map(v=>displayText(v,2000)).join('\n')+'\n');
}
main().catch(e=>{process.stderr.write(displayText(e.status?e.message:'Sim view failed. Check arguments, private file ownership and configuration.',500)+'\n');process.exitCode=1;});
