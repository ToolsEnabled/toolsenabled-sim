import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startHub,defaultScenario,defaultAssignments} from '../src/hub.mjs';
import {McpClient} from './mcp-client.mjs';
export async function runDemo({output,assignments,scenario=defaultScenario()}={}){
 if(!output)throw new Error('Demo output directory required');await mkdir(dirname(output),{recursive:true,mode:0o700});await mkdir(output,{recursive:false,mode:0o700});
 assignments??=defaultAssignments(scenario);
 const hub=await startHub({root:join(output,'hub'),scenario,assignments});const clients=[];
 try{
  const coordinator=new McpClient(hub.connections.coordinator);clients.push(coordinator);await coordinator.initialize();
  const agents=[];for(const a of assignments){const client=new McpClient(hub.connections[a.robotId]);clients.push(client);await client.initialize();agents.push({client,assignment:a});}
  const transcript=[];
  async function call(client,who,name,args){const result=await client.call(name,args);transcript.push({who,name,args,result});return result;}
  for(const {client,assignment:a} of agents){const r=scenario.robots.find(r=>r.id===a.robotId),c=scenario.crates.find(c=>c.id===a.crateId);await call(client,a.agentId,'sim.observe',{robotId:r.id});await call(client,a.agentId,'robot.goto',{robotId:r.id,x:c.x-.7,y:c.y});}
  for(let i=0;i<2;i++)await call(coordinator,'coordinator','sim.step',{n:60});
  for(const {client,assignment:a} of agents)await call(client,a.agentId,'robot.grab',{robotId:a.robotId,crateId:a.crateId});
  for(const {client,assignment:a} of agents){const c=scenario.crates.find(c=>c.id===a.crateId),z=scenario.zones.find(z=>z.id===c.zone);await call(client,a.agentId,'robot.goto',{robotId:a.robotId,x:z.x-.7,y:z.y});}
  for(let i=0;i<7;i++)await call(coordinator,'coordinator','sim.step',{n:60});
  for(const {client,assignment:a} of agents)await call(client,a.agentId,'robot.release',{robotId:a.robotId});
  await call(coordinator,'coordinator','sim.step',{n:60});
  const status=await coordinator.call('sim.status',{});if(!status.complete||status.collisions!==0)throw new Error(`Demo failed: ${JSON.stringify(status)}`);
  for(const file of ['trajectory.jsonl','actions.jsonl','scenario.json','work-record.json'])await copyFile(join(hub.runDir,file),join(output,file));
  await writeFile(join(output,'mcp-transcript.json'),JSON.stringify(transcript,null,2)+'\n');
  for(const client of clients)await client.close();
  const receipt={status,clientsExited:clients.length,modelsInvoked:0,transport:'4 stdio MCP clients / shared loopback hub',assignmentSource:assignments[0].taskId.startsWith('script-')?'local-script':'imported-fleet-work-record'};
  await writeFile(join(output,'demo-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
 }finally{for(const client of clients)await client.close();await hub.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),at=args.indexOf('--output'),wi=args.indexOf('--work-record');
 if(at<0)throw new Error('Usage: node tools/demo.mjs --output NEW_DIR [--work-record JSON]');
 console.log(JSON.stringify(await runDemo({output:resolve(args[at+1]),assignments:wi<0?undefined:JSON.parse(await readFile(args[wi+1],'utf8')).assignments}),null,2));
}
