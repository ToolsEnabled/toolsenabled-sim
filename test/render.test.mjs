import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runDemo} from '../tools/demo.mjs';
import {capture} from '../tools/capture.mjs';
test('real headless Three.js: all cameras, RGB 1080 PNG, pure out-of-order renderAt and repeated bytes', async()=>{
 const root=await mkdtemp(join(tmpdir(),'sim-render-')),previousUmask=process.umask(0);
 try {
  await runDemo({output:join(root,'run')});
  const a=await capture({run:join(root,'run'),output:join(root,'frames-a'),times:[0,5,1,5],cameras:'all'});
  const b=await capture({run:join(root,'run'),output:join(root,'frames-b'),times:[0,5,1,5],cameras:'all'});
  for(const [path,mode] of [['frames-a',0o700],['frames-a/multiview',0o700],['frames-a/multiview/000000.png',0o600],['frames-a/capture-receipt.json',0o600]])assert.equal((await stat(join(root,path))).mode&0o777,mode,'I-2 private capture: '+path);
  assert.deepEqual(a.hashes,b.hashes); assert.equal(a.width,1080); assert.equal(a.height,1080);
  assert.ok(a.cameras.includes('overview_top')); assert.ok(a.cameras.includes('robot_amber_fpv'));
  for(const cam of a.cameras){
   const png=await readFile(join(root,'frames-a',cam,'000001.png')); assert.deepEqual(png,await readFile(join(root,'frames-a',cam,'000003.png')));
   assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),1080);assert.equal(png[25],2);
  }
  assert.equal(a.networkExternal,0); assert.equal(a.watermark,'SIMULATION');
 }finally{process.umask(previousUmask);await rm(root,{recursive:true,force:true});}
});
test('Studio page contract: read-only server, promise hook, metadata and no clock/random reads while drawing',async()=>{
 const {serveReplay}=await import('../src/replay-server.mjs');const {chromium}=await import('playwright-core');
 const root=await mkdtemp(join(tmpdir(),'sim-hook-'));let server,browser;
 try{
  await runDemo({output:join(root,'run')});server=await serveReplay({run:join(root,'run')});
  const post=await fetch(server.url+'/capture',{method:'POST',headers:{origin:new URL(server.url).origin,'content-type':'application/json'},body:'{}'});assert.equal(post.status,405);
  const escape=await fetch(server.url+'/%2e%2e/package.json');assert.equal(escape.status,404);
  browser=await chromium.launch({headless:true,executablePath:process.env.SIM_CHROMIUM_EXECUTABLE||chromium.executablePath(),chromiumSandbox:false,args:['--no-zygote','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1080,height:1080},deviceScaleFactor:1});await page.goto(server.url);await page.waitForSelector('body[data-ready="1"]');
  const result=await page.evaluate(async()=>{
   const random=Math.random,now=Date.now,perf=performance.now;Math.random=()=>{throw new Error('Unseeded random');};Date.now=()=>{throw new Error('Wall clock');};performance.now=()=>{throw new Error('Clock');};
   try{const p=window.renderAt(5);if(!p||typeof p.then!=='function')throw new Error('Promise required');await p;const meta=await window.studioRasterMetadata(5);return {meta,last:window.lastRender,cameras:window.cameraMetadata};}finally{Math.random=random;Date.now=now;performance.now=perf;}
  });
  assert.ok(result.meta[0].texts.some(t=>t.text==='SIMULATION'));assert.equal(result.meta[0].rect.w,1080);assert.equal(result.last.time,5);assert.equal(result.cameras.robotFpv.height,1.8);assert.equal(result.cameras.robotFpv.pitchDegrees,20);assert.equal(result.cameras.lighting.shadows,'PCFSoftShadowMap');assert.ok(result.meta[0].texts.some(t=>t.text==='A'&&t.size>=14));
  await assert.rejects(page.evaluate(()=>window.renderAt(-1)));await assert.rejects(page.evaluate(()=>window.renderAt(11)));await assert.rejects(page.evaluate(()=>window.renderAt(1,'missing')));
 }finally{if(browser)await browser.close();if(server)await server.close();await rm(root,{recursive:true,force:true});}
});
test('data-driven tall arenas fit the overview and raster metadata matches drawn labels',async()=>{
 const {serveReplay}=await import('../src/replay-server.mjs');const {chromium}=await import('playwright-core');const {defaultScenario}=await import('../src/hub.mjs');
 const root=await mkdtemp(join(tmpdir(),'sim-tall-'));let server,browser;
 try{
  const {defaultAssignments}=await import('../src/hub.mjs');const scenario=defaultScenario();scenario.arena.depth=24;scenario.name='Tall yard';scenario.zones[0].label='Zone a';const assignments=defaultAssignments(scenario).map((a,i)=>({...a,driverLabel:['CUSTOM DRIVER','CODEX','CLAUDE CODE'][i]}));await runDemo({output:join(root,'run'),scenario,assignments});server=await serveReplay({run:join(root,'run')});
  browser=await chromium.launch({headless:true,executablePath:process.env.SIM_CHROMIUM_EXECUTABLE||chromium.executablePath(),chromiumSandbox:false,args:['--no-zygote','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1080,height:1080}});await page.goto(server.url);await page.waitForSelector('body[data-ready="1"]');await page.evaluate(()=>window.renderAt(5));const data=await page.evaluate(async()=>({cameras:window.cameraMetadata,text:(await window.studioRasterMetadata())[0].texts.map(t=>t.text),full:(await window.renderAt(5,'overview'),(await window.studioRasterMetadata())[0].texts.map(t=>t.text))}));
  assert.equal(data.cameras.top.orthographicSpan,26);assert.equal(data.cameras.overview.fitFraction,.85);assert.ok(data.cameras.overview.floorBounds.every(p=>Math.abs(p[0])<=.86&&Math.abs(p[1])<=.86));assert.ok(data.full.includes('ZONE A'));assert.ok(data.text.includes('TALL YARD 01'));for(const label of ['CUSTOM DRIVER','CODEX','CLAUDE CODE'])assert.ok(data.text.includes(label));assert.ok(!data.text.includes('SCRIPT-AMBER'));
 }finally{if(browser)await browser.close();if(server)await server.close();await rm(root,{recursive:true,force:true});}
});
