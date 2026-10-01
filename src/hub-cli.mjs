import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {startHub,defaultScenario,defaultAssignments} from './hub.mjs';
import {runHubCli} from './cli-lifecycle.mjs';
const args=process.argv.slice(2);function option(name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1];}
const root=option('--root');if(!root){console.error('Usage: node src/hub-cli.mjs --root NEW_PRIVATE_DIR [--scenario scene.json] [--work-record work-record.json]');process.exit(1);}
const scenario=option('--scenario')?JSON.parse(readFileSync(option('--scenario'))):defaultScenario();
const work=option('--work-record')?JSON.parse(readFileSync(option('--work-record'))):{assignments:defaultAssignments(scenario)};
await runHubCli(async()=>({hub:await startHub({root:resolve(root),scenario,assignments:work.assignments})}),({hub})=>{
 console.log(JSON.stringify({root:resolve(root),connections:hub.connections}));
});
