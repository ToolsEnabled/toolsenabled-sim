import {readFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {verifyTrajectory,replayActions,hash} from '../src/sim.mjs';
const run=resolve(process.argv[2]||'runs/demo');
async function boundedRead(name){const file=join(run,name);if((await stat(file)).size>256*1024*1024)throw new Error('Replay file exceeds verifier byte limit');return readFile(file,'utf8');}
const trajectory=await boundedRead('trajectory.jsonl');const checked=verifyTrajectory(trajectory);
const actions=(await boundedRead('actions.jsonl')).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));
const replay=await replayActions(checked.records[0],actions);
try{if(replay.trajectory()!==trajectory)throw new Error('Physics replay differs from recorded trajectory');console.log(JSON.stringify({ok:true,ticks:checked.ticks,trajectorySha256:hash(trajectory),finalHash:checked.finalHash}));}finally{replay.close();}
