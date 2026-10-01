import {readFile,readdir} from 'node:fs/promises';import {join,resolve} from 'node:path';
import {verifyTrajectory,hash,replayActions} from '../src/sim.mjs';
const base=resolve(process.argv[2]||'.'),run=join(base,'warehouse/run'),frames=join(base,'sample');
const text=await readFile(join(run,'trajectory.jsonl'),'utf8'),checked=verifyTrajectory(text);
const actions=(await readFile(join(run,'actions.jsonl'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));
const replay=await replayActions(checked.records[0],actions);try{if(replay.trajectory()!==text)throw new Error('Physics bytes differ');}finally{replay.close();}
const a=JSON.parse(await readFile(join(frames,'capture-receipt.json'),'utf8')),b=JSON.parse(await readFile(join(base,'sample-verified/capture-receipt.json'),'utf8'));
if(a.trajectorySha256!==hash(text)||b.trajectorySha256!==hash(text)||a.framesPerCamera!==300||a.cameras.length!==9||JSON.stringify(a.hashes)!==JSON.stringify(b.hashes))throw new Error('Capture manifest mismatch');
let count=0;for(const cam of a.cameras){const files=(await readdir(join(frames,cam))).filter(x=>x.endsWith('.png')).sort();if(files.length!==300)throw new Error(`Incomplete camera ${cam}`);for(let i=0;i<300;i++){if(files[i]!==`${String(i).padStart(6,'0')}.png`)throw new Error('Sequence gap');const png=await readFile(join(frames,cam,files[i]));if(hash(png)!==a.hashes[cam][i]||png.readUInt32BE(16)!==1080||png.readUInt32BE(20)!==1080||png[25]!==2)throw new Error('PNG mismatch');count++;}}
const fleet=JSON.parse(await readFile(join(base,'warehouse/fleet-receipt.json'),'utf8'));
if(!fleet.ok||fleet.transitions.length!==3||fleet.transitions.some(t=>t.states.at(-1)!=='succeeded'||t.ledgerStatus!=='done'))throw new Error('Fleet proof incomplete');
for(const row of checked.records.slice(1))for(const robot of row.robots){const a=fleet.transitions.find(t=>t.robotId===robot.id);if(robot.agentId!==a.agentId||robot.taskId!==a.taskId||robot.ledgerId!==a.ledgerId)throw new Error('Missing Fleet provenance');}
const final=checked.records.at(-1).status;if(final.delivered!==3||final.collisions!==0||final.score!==300||final.tick!==600)throw new Error('Warehouse result differs');
console.log(JSON.stringify({ok:true,ticks:checked.ticks,stateRecords:checked.records.length-1,delivered:final.delivered,collisions:final.collisions,score:final.score,cameras:a.cameras.length,frames:count,independentFrameMatches:count,width:1080,height:1080,format:'RGB PNG',fps:30,seconds:10,trajectorySha256:hash(text),chromiumSha256:a.chromiumSha256,fleetTasks:3,modelsInvoked:0},null,2));
