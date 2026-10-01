// Optional integration proof against a local Fleet checkout. No providers or agent CLIs.
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {defaultScenario} from '../src/hub.mjs';
import {runDemo} from './demo.mjs';
import {verifyTrajectory} from '../src/sim.mjs';
const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
if(!args.includes('--fleet-root')||!args.includes('--output'))throw new Error('Usage: node tools/prove-fleet.mjs --fleet-root LOCAL_FLEET_SOURCE --output NEW_DIR');
const fleet=resolve(get('--fleet-root')),output=resolve(get('--output')),stateRoot=join(output,'fleet-state');
await mkdir(output,{recursive:false,mode:0o700});await mkdir(stateRoot,{mode:0o700});
process.env.TOOLSENABLED_STATE_ROOT=stateRoot;process.env.TOOLSENABLED_STATE_PATH=join(stateRoot,'tasks.sqlite');
const require=createRequire(join(fleet,'package.json'));
const {createStateStore}=require(join(fleet,'src/lib/state-store.js'));
const ledger=require(join(fleet,'src/lib/owner-request-store.js'));
let serial=0;const now=1790850000000;
const store=createStateStore({file:join(stateRoot,'tasks.sqlite'),clock:()=>now,idFactory:prefix=>`${prefix}-sim-${String(++serial).padStart(4,'0')}`});
const opts={rootPath:(...parts)=>join(stateRoot,...parts),loadSettings:()=>({values:{},rejected:[]})};
const assignments=[],handles=[],transitions=[];const scenario=defaultScenario();
try{
 for(let i=0;i<3;i++){
  const r=scenario.robots[i],c=scenario.crates[i],agentId=`script-${r.id}`;
  const ledgerRecord=ledger.fileTask({scope:'global',words:`Deliver ${c.id} to ${c.zone} using robot ${r.id}.`,filedBy:'local',now:new Date(now).toISOString()},opts);
  const submitted=store.submitTask({queue:`sim-${r.id}`,type:'warehouse-delivery',idempotencyKey:`warehouse-${r.id}`,payload:{title:`Deliver ${c.id}`,objective:`Move ${c.id} to ${c.zone} without collisions.`,context:JSON.stringify({robotId:r.id,agentId,crateId:c.id,ledgerId:ledgerRecord.id})},expiryPolicy:'uncertain',maxAttempts:1});
  const claimed=store.claimTask({queue:`sim-${r.id}`,workerLabel:agentId,leaseMs:900000});store.startTask(claimed.handle,{leaseMs:900000});handles.push(claimed.handle);
  const a={robotId:r.id,agentId,driverLabel:`SCRIPTED MCP ${String.fromCharCode(65+i)}`,crateId:c.id,taskId:submitted.task.id,ledgerId:ledgerRecord.id};assignments.push(a);transitions.push({...a,states:['queued','leased','running']});
 }
 await writeFile(join(output,'work-record.json'),JSON.stringify({version:1,source:'ToolsEnabled Fleet SQLite task store and owner-request ledger; isolated scripted proof',assignments},null,2)+'\n');
 const demo=await runDemo({output:join(output,'run'),assignments,scenario});
 const rows=verifyTrajectory(await readFile(join(output,'run','trajectory.jsonl'),'utf8')).records.slice(1);
 for(const row of rows)for(const r of row.robots){const a=assignments.find(a=>a.robotId===r.id);if(r.agentId!==a.agentId||r.taskId!==a.taskId||r.ledgerId!==a.ledgerId)throw new Error('Tick lost Fleet provenance');}
 for(let i=0;i<3;i++){
  store.completeTask(handles[i],{result:{summary:`Delivered ${assignments[i].crateId}; zero collisions; simulation tick 600.`}});
  ledger.completeTask({id:assignments[i].ledgerId,actor:'local',now:new Date(now+10000).toISOString()},opts);
  const task=store.getTask({taskId:assignments[i].taskId,includePayload:true});if(task.status!=='succeeded')throw new Error('Fleet work not completed');
  transitions[i].states.push('succeeded');const finalRecord=ledger.findRecord(assignments[i].ledgerId,opts);Object.assign(transitions[i],{ledgerStatus:finalRecord.status,filedBy:finalRecord.filedBy,completedBy:finalRecord.completedBy});
  if(transitions[i].ledgerStatus!=='done')throw new Error('Fleet ledger not completed');
 }
 const sourceHashes={};for(const f of ['src/lib/state-store.js','src/lib/owner-request-store.js'])sourceHashes[f]=createHash('sha256').update(await readFile(join(fleet,f))).digest('hex');
 const receipt={ok:true,actor:'local',driverKind:'scripted',modelsInvoked:0,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:fleet,encoding:'utf8'}).trim(),sourceHashes,transitions,ticksWithFleetIds:rows.length,demo};
 await writeFile(join(output,'fleet-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}finally{store.close();}
