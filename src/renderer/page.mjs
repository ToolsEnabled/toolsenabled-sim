import * as THREE from '../vendor/three.module.js';
import {text,drawnText} from './glyphs.mjs';
const output=document.getElementById('output'),ctx=output.getContext('2d',{alpha:false});
const gpu=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'low-power'});gpu.setPixelRatio(1);gpu.outputColorSpace=THREE.SRGBColorSpace;gpu.toneMapping=THREE.NoToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#152338');
gpu.shadowMap.enabled=true;gpu.shadowMap.type=THREE.PCFSoftShadowMap;
scene.add(new THREE.HemisphereLight('#eef5ff','#53657a',1.7));const sun=new THREE.DirectionalLight('#fff0d9',2.1);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.bias=-.0003;sun.shadow.normalBias=.02;scene.add(sun);
const mats={};function mat(color){return mats[color]??=new THREE.MeshStandardMaterial({color,roughness:.75,metalness:.1});}
function box(x,y,z,w,h,d,color,parent=scene){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.castShadow=h>.08;m.receiveShadow=true;parent.add(m);return m;}
const robots=new Map(),crates=new Map(),cameras=new Map();let log,header,states,cameraMeta;
let cameraFar=100;const perspective=()=>new THREE.PerspectiveCamera(60,1,.05,cameraFar);
function fitOverview(camera,aspect=1){
 camera.clearViewOffset();camera.aspect=aspect;camera.zoom=1;camera.updateProjectionMatrix();
 const a=header.scenario.arena,direction=new THREE.Vector3(.65,1,.8).normalize();
 camera.position.copy(direction).multiplyScalar(Math.max(a.width,a.depth)*1.5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z])=>new THREE.Vector3(x*a.width/2,0,z*a.depth/2));
 const projected=corners.map(p=>p.clone().project(camera)),xs=projected.map(p=>p.x),ys=projected.map(p=>p.y);
 const left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);
 camera.zoom=1.7/Math.max(right-left,top-bottom);
 // Off-axis projection centers the projected floor, including perspective foreshortening.
 camera.setViewOffset(1000*aspect,1000,(left+right)*camera.zoom*250*aspect,-(top+bottom)*camera.zoom*250,1000*aspect,1000);
 return corners.map(p=>{const q=p.project(camera);return [q.x,q.y];});
}
function zoneLabels(camera,x,y,w,h){
 const occupied=[];ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
 for(const z of header.scenario.zones){
  const anchor=new THREE.Vector3(z.x,.08,z.y).project(camera);if(anchor.z< -1||anchor.z>1||Math.abs(anchor.x)>.94||Math.abs(anchor.y)>.94)continue;
  const scale=w>=600?3:2,label=w>=1000?z.label.toUpperCase():z.label.toUpperCase().split(/[ /_-]/)[0],lw=label.length*6*scale+16,lh=7*scale+12;
  const px=Math.max(x+4,Math.min(x+w-lw-4,x+(anchor.x+1)*w/2-lw/2));let py=y+(1-anchor.y)*h/2-lh/2;
  for(const old of occupied)if(px<old.x+old.w&&px+lw>old.x&&py<old.y+old.h&&py+lh>old.y)py=old.y-lh-4;
  py=Math.max(y+4,Math.min(y+h-lh-4,py));occupied.push({x:px,y:py,w:lw,h:lh});
  ctx.fillStyle='#101f30';ctx.fillRect(px,py,lw,lh);ctx.fillStyle=z.color;ctx.fillRect(px,py,4,lh);text(ctx,label,px+9,py+6,scale,'#f2f7ff');
 }
 ctx.restore();
}
function init(data){
 header=data[0];states=data.slice(1);log=data;
 const callers=new Map();for(const state of states){for(const e of state.events||[])if(e.args?.robotId&&e.name!=='robot.submit')callers.set(e.args.robotId,e.caller||e.identity);for(const r of state.robots)if(!Object.hasOwn(r,'caller'))r.caller=callers.get(r.id)||null;}const s=header.scenario,span=Math.max(s.arena.width,s.arena.depth);cameraFar=Math.max(100,span*5);
 sun.position.set(-span*.4,span*.9,-span*.3);Object.assign(sun.shadow.camera,{left:-span*.8,right:span*.8,top:span*.8,bottom:-span*.8,near:.1,far:span*4});sun.shadow.camera.updateProjectionMatrix();
 box(0,-.1,0,s.arena.width,.2,s.arena.depth,'#263a50');
 const vertices=[];for(let x=-s.arena.width/2;x<=s.arena.width/2;x++)vertices.push(x,.005,-s.arena.depth/2,x,.005,s.arena.depth/2);for(let z=-s.arena.depth/2;z<=s.arena.depth/2;z++)vertices.push(-s.arena.width/2,.005,z,s.arena.width/2,.005,z);const gridGeometry=new THREE.BufferGeometry();gridGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));scene.add(new THREE.LineSegments(gridGeometry,new THREE.LineBasicMaterial({color:'#41576a',transparent:true,opacity:.32})));
 for(const z of s.zones){box(z.x,.012,z.y,z.width,.018,z.depth,z.color);box(z.x,.025,z.y,z.width-.12,.025,z.depth-.12,'#1c3547');}
 for(const o of s.obstacles){
  box(o.x,.48,o.y,o.width,.95,o.depth,'#344b61');box(o.x,1,o.y,o.width+.04,.08,o.depth+.06,'#7995a7');
  for(let x=-o.width/2+.15;x<o.width/2;x+=.8){box(o.x+x,.6,o.y,.065,1.2,o.depth+.08,'#e1a756');box(o.x+x+.22,.45,o.y,.3,.65,o.depth-.04,'#607488');}
 }
 for(const z of [-s.arena.depth/2,s.arena.depth/2])box(0,.25,z,s.arena.width,.5,.12,'#7e93a5');
 for(const x of [-s.arena.width/2,s.arena.width/2])box(x,.25,0,.12,.5,s.arena.depth,'#7e93a5');
 for(const r of s.robots){
  const g=new THREE.Group();box(0,.34,0,.66,.32,.56,r.color,g);box(-.07,.55,0,.34,.1,.38,'#122333',g);box(.30,.43,0,.05,.1,.26,'#d4faff',g);
  for(const z of [-.33,.33])for(const x of [-.20,.20]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.1,12),mat('#0b1420'));wheel.castShadow=true;wheel.receiveShadow=true;wheel.rotation.x=Math.PI/2;wheel.position.set(x,.18,z);g.add(wheel);}
  box(.1,.68,0,.08,.22,.08,'#eaf9ff',g);scene.add(g);robots.set(r.id,g);cameras.set(`robot_${r.id}_fpv`,perspective());cameras.set(`robot_${r.id}_chase`,perspective());
 }
 for(const c of s.crates){const g=new THREE.Group(),z=s.zones.find(z=>z.id===c.zone);box(0,.3,0,.6,.6,.6,'#b8844e',g);box(0,.612,0,.14,.012,.62,z.color,g);box(0,.3,-.306,.12,.6,.015,z.color,g);box(-.306,.3,0,.015,.6,.12,'#eed0a3',g);scene.add(g);crates.set(c.id,g);}
 const overview=perspective();const floorBounds=fitOverview(overview);cameras.set('overview',overview);
 const top=new THREE.OrthographicCamera(-span/2-1,span/2+1,span/2+1,-span/2-1,.05,cameraFar);top.position.set(0,22,0);top.up.set(0,0,-1);top.lookAt(0,0,0);cameras.set('overview_top',top);
 cameraMeta={units:'metres',worldAxes:{x:'east',y:'up',z:'south (simulation y)'},width:1080,height:1080,fps:30,names:[...cameras.keys()],perspective:{verticalFovDegrees:60,near:.05,far:cameraFar,fx:540/Math.tan(Math.PI/6),fy:540/Math.tan(Math.PI/6),cx:540,cy:540},top:{orthographicSpan:span+2,position:[0,22,0],up:[0,0,-1]},overview:{position:overview.position.toArray(),target:[0,0,0],zoom:overview.zoom,projectionMatrix:overview.projectionMatrix.toArray(),viewOffset:{...overview.view},fitFraction:.85,floorBounds},lighting:{shadows:'PCFSoftShadowMap',shadowMapSize:1024,directionalPosition:sun.position.toArray(),hemisphereIntensity:1.7,directionalIntensity:2.1},robotFpv:{height:1.8,forwardOffset:0,lookAhead:4,pitchDegrees:20,targetHeight:1.8-4*Math.tan(Math.PI/9)},robotChase:{height:3.3,backOffset:3.4,lookAhead:.8,targetHeight:.25}};
 window.simCameras=[...cameras.keys()];window.cameraMetadata=cameraMeta;
}
function sample(t){if(!Number.isFinite(t)||t<0||t>states.at(-1).tick*header.dt)throw new Error('Render time outside trajectory');const raw=t/header.dt,index=Math.min(states.length-1,Math.floor(raw)),a=states[index],b=states[Math.min(index+1,states.length-1)],f=raw-index;const lerp=(x,y)=>x+(y-x)*f;
 const rs=a.robots.map((r,i)=>({...r,x:lerp(r.x,b.robots[i].x),y:lerp(r.y,b.robots[i].y),heading:r.heading+Math.atan2(Math.sin(b.robots[i].heading-r.heading),Math.cos(b.robots[i].heading-r.heading))*f}));
 return {robots:rs,crates:a.crates.map((c,i)=>({...c,x:lerp(c.x,b.crates[i].x),y:lerp(c.y,b.crates[i].y)})),status:a.status,tick:a.tick};
}
function setState(state){
 for(const r of state.robots){const g=robots.get(r.id);g.position.set(r.x,0,r.y);g.rotation.y=-r.heading;const dx=Math.cos(r.heading),dz=Math.sin(r.heading);
  const fpv=cameras.get(`robot_${r.id}_fpv`);fpv.position.set(r.x,1.8,r.y);fpv.lookAt(r.x+dx*4,1.8-4*Math.tan(Math.PI/9),r.y+dz*4);
  const chase=cameras.get(`robot_${r.id}_chase`);chase.position.set(r.x-dx*3.4,3.3,r.y-dz*3.4);chase.lookAt(r.x+dx*.8,.25,r.y+dz*.8);
 }
 for(const c of state.crates)crates.get(c.id).position.set(c.x,0,c.y);
}
function panel(cameraName,x,y,w,h,label,accent='#638397'){
 const camera=cameras.get(cameraName);if(!camera)throw new Error('Unknown camera');
 ctx.fillStyle='#233249';ctx.fillRect(x-1,y-1,w+2,h+2);gpu.setSize(w,h-32,false);if(camera.isPerspectiveCamera){camera.aspect=w/(h-32);camera.updateProjectionMatrix();}
 if(cameraName==='overview')fitOverview(camera,w/(h-32));
 gpu.render(scene,camera);ctx.drawImage(gpu.domElement,x,y+32,w,h-32);zoneLabels(camera,x,y+32,w,h-32);ctx.fillStyle='#152237';ctx.fillRect(x,y,w,32);ctx.fillStyle=accent;ctx.fillRect(x,y,4,32);text(ctx,label,x+14,y+10,2,'#d8e5f6');
}
window.renderAt=async(t,camera='multiview')=>{
 drawnText.length=0;
 const state=sample(t);setState(state);ctx.fillStyle='#0b1423';ctx.fillRect(0,0,1080,1080);
 if(camera==='multiview'){
  text(ctx,'TOOLSENABLED / SIM',24,27,3);text(ctx,header.scenario.name.split(' · ')[0].toUpperCase().slice(0,48)+' '+String(header.scenario.version).padStart(2,'0'),24,63,2,'#93acc5');
  ctx.fillStyle='#f0b064';ctx.fillRect(804,22,252,40);text(ctx,'SIMULATION',820,31,3,'#172333');text(ctx,`${header.scenario.robots.length} AGENTS / SHARED WORLD`,768,77,2,'#a6bfd5');
  panel('overview',24,110,684,510,'01 / OVERVIEW');panel('overview_top',722,110,334,248,'02 / TOP DOWN');panel(`robot_${header.scenario.robots[0].id}_chase`,722,372,334,248,'03 / CHASE');
  const count=header.scenario.robots.length,spacing=1044/count;header.scenario.robots.forEach((r,i)=>{panel(`robot_${r.id}_fpv`,24+i*spacing,638,spacing-12,278,`${r.id} / FPV`,r.color);const a=header.assignments.find(a=>a.robotId===r.id);const caller=state.robots.find(x=>x.id===r.id).caller;const credit=caller?.role==='robot'&&caller.agentId===a.agentId?(a.driverLabel||a.agentId):caller?.agentId||'UNCOMMANDED';text(ctx,credit.slice(0,27),28+i*spacing,931,2,r.color);});
  ctx.fillStyle='#17263b';ctx.fillRect(24,968,1032,88);text(ctx,`TIME ${t.toFixed(2)} S`,42,988,2);text(ctx,`DELIVERED ${state.status.delivered}/${state.status.total}`,300,988,2,'#57ddc8');text(ctx,`CONTACTS ${state.status.collisions}`,610,988,2);text(ctx,`SCORE ${state.status.score}`,842,988,2,'#ffbd59');
  text(ctx,'FIXED STEP 60 HZ / REPLAY 30 FPS / OFFLINE',42,1026,2,'#93acc5');
 }else{
  const cam=cameras.get(camera);if(!cam)throw new Error('Unknown camera');gpu.setSize(1080,1080,false);if(cam.isPerspectiveCamera){cam.aspect=1;cam.updateProjectionMatrix();}if(camera==='overview')fitOverview(cam);gpu.render(scene,cam);ctx.drawImage(gpu.domElement,0,0);zoneLabels(cam,0,0,1080,1080);ctx.fillStyle='#152237';ctx.fillRect(0,0,1080,32);text(ctx,camera.toUpperCase(),14,10,2);ctx.fillStyle='#f0b064';ctx.fillRect(804,45,252,40);text(ctx,'SIMULATION',820,54,3,'#172333');ctx.fillStyle='#122034';ctx.fillRect(20,1025,500,36);text(ctx,`TIME ${t.toFixed(2)} S / SCORE ${state.status.score}`,34,1036,2);
 }
 window.lastRender={time:t,camera,watermark:'SIMULATION'};return window.lastRender;
};
window.render=window.renderAt;
window.studioRasterMetadata=async()=>[{rect:{x:0,y:0,w:1080,h:1080},private_regions:[],texts:structuredClone(drawnText)}];
init(await (await fetch(new URL('../trajectory.json',import.meta.url))).json());await window.renderAt(0);window.ready=true;document.body.dataset.ready='1';
