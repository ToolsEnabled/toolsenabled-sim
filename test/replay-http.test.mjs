import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startHub} from '../src/hub.mjs';
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'sim-replay-http-'));let hub;try{hub=await startHub({root});await fn(hub);}finally{await hub?.close();await rm(root,{recursive:true,force:true});}}
test('S-3: replay trajectory and assets require the private launch capability',async()=>{
 const {serveReplay}=await import('../src/replay-server.mjs');await fixture(async hub=>{const page=await serveReplay({run:hub.runDir});try{const origin=new URL(page.url).origin;assert.equal((await fetch(origin+'/trajectory.json')).status,401);assert.equal((await fetch(origin+'/')).status,401);const permitted=await fetch(new URL('trajectory.json',page.url));assert.equal(permitted.status,200);assert.equal(permitted.headers.get('x-content-type-options'),'nosniff');assert.equal(permitted.headers.get('referrer-policy'),'no-referrer');const rows=await permitted.json();assert.equal(rows[0].kind,'header');}finally{await page.close();}});
});
