import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {startHub,defaultScenario,defaultAssignments} from './hub.mjs';
import {runHubCli,absoluteInputPath,runCli,cliOption} from './cli-lifecycle.mjs';
await runCli(async()=>{
const args=process.argv.slice(2),option=(name,fallback)=>cliOption(args,name,fallback);
const root=option('--root');if(root===undefined){throw new Error('Usage: node src/hub-cli.mjs --root NEW_PRIVATE_DIR [--scenario scene.json] [--work-record work-record.json] [--engine rapier|mujoco]');}
const engine=option('--engine','rapier');
for(const name of ['--root','--work-record','--scenario'])if(args.includes(name))absoluteInputPath(option(name),name);
const scenario=option('--scenario')?JSON.parse(readFileSync(option('--scenario'))):defaultScenario();
const work=option('--work-record')?JSON.parse(readFileSync(option('--work-record'))):{assignments:defaultAssignments(scenario)};
await runHubCli(async()=>({hub:await startHub({root:resolve(root),scenario,assignments:work.assignments,engine})}),({hub})=>{
 console.log(JSON.stringify({root:resolve(root),connections:hub.connections}));
});
});
