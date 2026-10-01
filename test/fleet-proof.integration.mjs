// Optional release integration against the operator's offline Fleet checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('I-7: real Fleet records and events identify the scripted local actor',async()=>{
 const fleet=process.env.SIM_FLEET_ROOT;if(!fleet)throw new Error('Set SIM_FLEET_ROOT to the offline Fleet source checkout');const temp=await mkdtemp(join(tmpdir(),'sim-fleet-')),output=process.env.SIM_FLEET_PROOF_OUTPUT||join(temp,'proof');
 try{const {stdout,stderr}=await promisify(execFile)(process.execPath,['tools/prove-fleet.mjs','--fleet-root',fleet,'--output',output],{timeout:30000});await writeFile(join(output,'proof-process.log'),stderr+stdout,{mode:0o600});
  const events=(await readFile(join(output,'fleet-state/state/owner-request-record-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(events.length,6);for(const event of events)assert.equal(event.actor,'local');
  const receipt=JSON.parse(await readFile(join(output,'fleet-receipt.json'),'utf8'));assert.equal(receipt.actor,'local');assert.equal(receipt.driverKind,'scripted');assert.equal(receipt.modelsInvoked,0);for(const t of receipt.transitions){assert.equal(t.filedBy,'local');assert.equal(t.completedBy,'local');assert.equal(t.ledgerStatus,'done');assert.equal(t.states.at(-1),'succeeded');}
 }finally{await rm(temp,{recursive:true,force:true});}
});
