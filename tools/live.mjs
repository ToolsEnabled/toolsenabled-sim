import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startHub,defaultScenario} from '../src/hub.mjs';
import {validateAssignments} from '../src/sim.mjs';
import {runHubCli} from '../src/cli-lifecycle.mjs';
import {connectionConfig,formatConfig} from './mcp-config.mjs';
const quote=value=>`'${String(value).replaceAll("'", "'\\''")}'`;
export function registration(identity,connection){
 const config=connectionConfig(connection);
 return {...identity,connection:resolve(connection),claudeCode:{command:`claude mcp add-json --scope local toolsenabled_sim ${quote(JSON.stringify({...config,type:'stdio'}))}`,config:JSON.parse(formatConfig('claude',connection))},codex:{command:`codex mcp add toolsenabled_sim --env ${quote('SIM_CONNECTION='+config.env.SIM_CONNECTION)} -- ${[config.command,...config.args].map(quote).join(' ')}`,config:formatConfig('codex',connection)}};
}
export async function launchLive({root,scenario=defaultScenario(),assignments,budgetMs=120000,stepTicks=60,activeRobots,maxTicks=36000}){
 assignments=validateAssignments(assignments,scenario);
 if(assignments.some(a=>!a.driverLabel))throw new Error('Live work records require the actual driverLabel for every agent');
 const hub=await startHub({root,scenario,assignments,maxTicks,live:{budgetMs,stepTicks,activeRobots:activeRobots??scenario.robots.map(r=>r.id)}});
 return {hub,registrations:[registration({role:'coordinator',agentId:'coordinator'},hub.connections.coordinator),...assignments.map(a=>registration({role:'robot',robotId:a.robotId,agentId:a.agentId,driverLabel:a.driverLabel,active:!activeRobots||activeRobots.includes(a.robotId)},hub.connections[a.robotId]))]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),values={};
 for(let i=0;i<args.length;i+=2){if(args[i]==='--json'){if(values['--json'])throw new Error('Duplicate --json');values['--json']=true;i--;continue;}if(!['--root','--scenario','--work-record','--budget-seconds','--step-ticks','--active','--max-ticks'].includes(args[i])||!args[i+1]||Object.hasOwn(values,args[i]))throw new Error('Invalid live option');values[args[i]]=args[i+1];}
 if(!values['--root']||!values['--work-record'])throw new Error('Usage: node tools/live.mjs --root NEW_PRIVATE_ROOT --work-record WORK_RECORD.json [--scenario SCENE.json] [--budget-seconds 120] [--step-ticks 60] [--active amber,teal,violet] [--max-ticks 36000] [--json]');
 const budgetMs=Number(values['--budget-seconds']??120)*1000,stepTicks=Number(values['--step-ticks']??60);
 await runHubCli(()=>launchLive({root:resolve(values['--root']),assignments:JSON.parse(readFileSync(values['--work-record'],'utf8')).assignments,scenario:values['--scenario']?JSON.parse(readFileSync(values['--scenario'],'utf8')):defaultScenario(),budgetMs,stepTicks,activeRobots:values['--active']?.split(','),maxTicks:Number(values['--max-ticks']??36000)}),({hub,registrations})=>{
 const report={mode:'live',budgetMs,stepTicks,runDir:hub.runDir,registrationInstructions:'Choose one host per agent. Give it only its own registration. Separate profiles organize settings; separate OS accounts or sandboxes provide isolation (SECURITY.md). Commands are printed, never executed. The first round budget is running now.',agentInstructions:'Read sim.status and sim.observe. Copy live.round into each robot command. Call robot.submit with robotId and round after your commands, even when continuing an existing goto. Reobserve if the round changed. Missing robots hold on deadline.',registrations};
 console.log(values['--json']?JSON.stringify(report,null,2):[`Live run: ${hub.runDir} (${budgetMs/1000}s budget, ${stepTicks} ticks/step)`,report.registrationInstructions,report.agentInstructions,...registrations.flatMap(r=>['',`role=${r.role} agentId=${r.agentId}${r.robotId?' robotId='+r.robotId:''}`,`Connection: ${r.connection}`,'Claude Code (POSIX):',r.claudeCode.command,'Codex (POSIX):',r.codex.command])].join('\n'));
 });
}
