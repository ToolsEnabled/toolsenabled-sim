import {serveReplay} from '../src/replay-server.mjs';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {verifyTrajectory,hash} from '../src/sim.mjs';
async function fileHash(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
export async function capture({run,output,times,cameras='all',seconds=10,verifyAgainst,progress=()=>{}}){
 const path=join(run,'trajectory.jsonl');if((await stat(path)).size>256*1024*1024)throw new Error('Trajectory exceeds bounded capture size');
 const input=await readFile(path,'utf8'),checked=verifyTrajectory(input);
 times??=Array.from({length:Math.round(seconds*30)},(_,i)=>i/30);
 if(!times.length||times.length>18000||times.some(t=>!Number.isFinite(t)||t<0||t>checked.ticks/60))throw new Error('Capture time exceeds run');
 const replay=await serveReplay({run});
 const base=replay.url,origin=new URL(base).origin;let browser;
 try{
  await mkdir(output,{recursive:false,mode:0o700});
  const executablePath=process.env.SIM_CHROMIUM_EXECUTABLE||chromium.executablePath();
  try{await stat(executablePath);}catch{throw new Error('Offline Chromium missing. Set SIM_CHROMIUM_EXECUTABLE to your supplied headless Chromium binary. No browser is downloaded.');}
  const launchArgs=['--no-zygote','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking','--disable-component-update'];
  browser=await chromium.launch({headless:true,executablePath,chromiumSandbox:false,args:launchArgs});
  const context=await browser.newContext({viewport:{width:1080,height:1080},deviceScaleFactor:1,locale:'en-US',timezoneId:'UTC',colorScheme:'dark',reducedMotion:'reduce',serviceWorkers:'block'});
  let networkExternal=0;await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){networkExternal++;return route.abort();}return route.continue();});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.ready===true,{},{timeout:30000});
  const meta=await page.evaluate(()=>window.cameraMetadata);
  const selected=cameras==='all'?['multiview',...meta.names]:typeof cameras==='string'?cameras.split(','):cameras;
  if(!selected.length||new Set(selected).size!==selected.length||selected.some(c=>c!=='multiview'&&!meta.names.includes(c)))throw new Error('Unknown or duplicate capture camera');
  const hashes={};for(const cam of selected){hashes[cam]=[];if(!verifyAgainst)await mkdir(join(output,cam),{mode:0o700});}
  const expected=verifyAgainst?JSON.parse(await readFile(join(verifyAgainst,'capture-receipt.json'),'utf8')):null;
  if(expected&&(JSON.stringify(expected.times)!==JSON.stringify(times)||JSON.stringify(expected.cameras)!==JSON.stringify(selected)))throw new Error('Verification frame selection differs');
  for(let i=0;i<times.length;i++){
   for(const cam of selected){
    const result=await page.evaluate(([t,c])=>window.renderAt(t,c),[times[i],cam]);if(result.watermark!=='SIMULATION')throw new Error('Missing simulation watermark');
    const png=await page.screenshot({type:'png',animations:'disabled',caret:'hide'});
    if(png.readUInt32BE(16)!==1080||png.readUInt32BE(20)!==1080||png[25]!==2)throw new Error('Capture must be square 1080 RGB PNG');
    const digest=hash(png);hashes[cam].push(digest);
    if(expected){if(expected.hashes[cam][i]!==digest)throw new Error(`Frame mismatch: ${cam}/${i}`);}else await writeFile(join(output,cam,`${String(i).padStart(6,'0')}.png`),png,{flag:'wx',mode:0o600});
   }
   if(i%30===0||i===times.length-1)progress({frame:i+1,total:times.length,cameras:selected.length});
  }
  if(errors.length)throw new Error(`Browser errors: ${errors.join('; ')}`);if(networkExternal)throw new Error('Renderer attempted external network');
  const receipt={version:1,width:1080,height:1080,color:'RGB',fps:30,framesPerCamera:times.length,times,cameras:selected,hashes,watermark:'SIMULATION',networkExternal,trajectorySha256:hash(input),browserVersion:browser.version(),chromiumSha256:await fileHash(executablePath),node:process.version,platform:process.platform,architecture:process.arch,renderer:'three@0.180.0 / SwiftShader',launchArgs,cameraMetadata:meta,verifiedAgainst:expected?expected.trajectorySha256:null};
  await writeFile(join(output,'capture-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});return receipt;
 }finally{if(browser)await browser.close();await replay.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),get=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
 if(!get('--run')||!get('--output'))throw new Error('Usage: node tools/capture.mjs --run RUN --output NEW_DIR [--seconds 10] [--cameras all|multiview|NAME,...] [--verify-against FRAMES]');
 const result=await capture({run:resolve(get('--run')),output:resolve(get('--output')),seconds:Number(get('--seconds',10)),cameras:get('--cameras','all'),verifyAgainst:get('--verify-against'),progress:p=>console.error(JSON.stringify(p))});
 console.log(JSON.stringify({framesPerCamera:result.framesPerCamera,cameras:result.cameras,chromiumSha256:result.chromiumSha256,verified:!!result.verifiedAgainst}));
}
