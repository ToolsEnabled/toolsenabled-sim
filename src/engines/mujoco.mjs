import loadMujoco from '@mujoco/mujoco';
// MuJoCo engine: robotics-grade rigid-body physics (Google DeepMind, official WebAssembly build).
// Unlike the Rapier world, gravity, floor friction and motor force limits are on: robots are
// driven by bounded velocity actuators, crates are free boxes that slide and stop under friction,
// and a grabbed crate is welded 0.75 m in front of its robot. The single-threaded build is
// deterministic, so recorded runs replay exactly.
export const MUJOCO_ENGINE='mujoco@3.14.0';
const MOTOR_FORCE=400,BRAKE_DECEL=.6*400/50,FLOOR_FRICTION='0.8 0.005 0.0001',CRATE_FRICTION='0.6 0.005 0.0001';
let loaded;
const xmlName=s=>String(s).replace(/[^A-Za-z0-9_.-]/g,c=>`_${c.codePointAt(0).toString(16)}_`);
const num=n=>Number(n).toPrecision(17).replace(/\.?0+$/,'');
const first=v=>typeof v==='number'?v:v[0];
// Embind accessor handles live on the WASM heap; read what is needed, then free them.
function read(handle,fn){try{return fn(handle);}finally{handle.delete();}}
export async function createMujocoWorld(dt){
 loaded??=loadMujoco(); const mj=await loaded;
 const items=[];let model=null,data=null,geomIds=null,contacts=new Set(),welds=null;
 // The bindings cannot expose the boolean eq_active array directly, so welds are switched
 // through MuJoCo's state API (mjSTATE_EQ_ACTIVE), which copies the flags as doubles.
 const EQ_ACTIVE=mj.mjtState.mjSTATE_EQ_ACTIVE.value??mj.mjtState.mjSTATE_EQ_ACTIVE;
 function setWeld(index,on){welds[index]=on?1:0;mj.mj_setState(model,data,welds,EQ_ACTIVE);}
 function compile(){
  if(model)return;
  const robots=items.filter(h=>h.kind==='robot'),crates=items.filter(h=>h.kind==='crate'),fixed=items.filter(h=>h.kind==='obstacle');
  const xs=items.map(h=>Math.abs(h.x0)+1),ys=items.map(h=>Math.abs(h.y0)+1);
  // Collision groups: robots never touch the floor (they are driven in the plane); crates rest on it.
 // MJCF names join an id to a suffix or to another id with '.', which no scene id can contain, so
 // ids that themselves contain '__' (such as a, a__b, b__x, x) never produce the same name twice.
  const body=[];
  body.push(`<geom name="__floor" type="plane" size="${num(Math.max(...xs,5))} ${num(Math.max(...ys,5))} .1" contype="4" conaffinity="4" friction="${FLOOR_FRICTION}"/>`);
  for(const h of robots)body.push(`<body name="${h.name}" pos="${num(h.x0)} ${num(h.y0)} .3"><joint name="${h.name}.x" type="slide" axis="1 0 0"/><joint name="${h.name}.y" type="slide" axis="0 1 0"/><joint name="${h.name}.yaw" type="hinge" axis="0 0 1"/><geom name="${h.name}" type="cylinder" size=".33 .3" mass="50" contype="1" conaffinity="1" margin=".02" gap=".02"/></body>`);
  for(const h of crates)body.push(`<body name="${h.name}" pos="${num(h.x0)} ${num(h.y0)} .3"><freejoint name="${h.name}.free"/><geom name="${h.name}" type="box" size="${num(h.w/2)} ${num(h.d/2)} .3" mass="1" contype="1" conaffinity="5" friction="${CRATE_FRICTION}" margin=".02" gap=".02"/></body>`);
  for(const h of fixed)body.push(`<geom name="${h.name}" type="box" pos="${num(h.x0)} ${num(h.y0)} .3" size="${num(h.w/2)} ${num(h.d/2)} .3" contype="1" conaffinity="1" margin=".02" gap=".02"/>`);
  const act=robots.map(h=>`<velocity name="${h.name}.vx" joint="${h.name}.x" kv="5000" forcelimited="true" forcerange="-${MOTOR_FORCE} ${MOTOR_FORCE}"/><velocity name="${h.name}.vy" joint="${h.name}.y" kv="5000" forcelimited="true" forcerange="-${MOTOR_FORCE} ${MOTOR_FORCE}"/>`);
  const weldXml=[];for(const r of robots)for(const c of crates)weldXml.push(`<weld name="${r.name}.${c.name}" body1="${r.name}" body2="${c.name}" relpose=".75 0 0 1 0 0 0" active="false"/>`);
  const xml=`<mujoco model="toolsenabled-sim"><option timestep="${num(dt)}" gravity="0 0 -9.81" integrator="implicitfast"/><worldbody>${body.join('')}</worldbody><actuator>${act.join('')}</actuator><equality>${weldXml.join('')}</equality></mujoco>`;
  model=mj.MjModel.from_xml_string(xml);data=new mj.MjData(model);
  geomIds=new Map();for(let g=0;g<model.ngeom;g++){const name=read(model.geom(g),x=>x.name);const h=items.find(x=>x.name===name);if(h)geomIds.set(g,h.id);}
  const jq=name=>read(model.jnt(name),j=>first(j.qposadr)),jv=name=>read(model.jnt(name),j=>first(j.dofadr)),aid=name=>read(model.actuator(name),a=>a.id);
  for(const h of robots){h.qx=jq(`${h.name}.x`);h.qy=jq(`${h.name}.y`);h.qyaw=jq(`${h.name}.yaw`);h.vyaw=jv(`${h.name}.yaw`);h.ax=aid(`${h.name}.vx`);h.ay=aid(`${h.name}.vy`);}
  for(const h of crates){h.q=jq(`${h.name}.free`);h.v=jv(`${h.name}.free`);}
  for(const r of robots)r.welds=new Map(crates.map(c=>[c.id,read(model.eq(`${r.name}.${c.name}`),e=>e.id)]));
  welds=new Float64Array(model.neq);
  mj.mj_forward(model,data);
 }
 return {
  id:MUJOCO_ENGINE,
  add(item,kind){if(model)throw new Error('MuJoCo world already built');const h={id:item.id,name:xmlName(item.id),kind,x0:item.x,y0:item.y,w:item.width||.6,d:item.depth||.6};items.push(h);return h;},
  count:()=>items.length,
  // Real motors cannot stop instantly: the go-to controller slows down early enough to stop on target.
  brakingSpeed:d=>Math.sqrt(2*BRAKE_DECEL*d),
  position(h){compile();if(h.kind==='robot')return {x:h.x0+data.qpos[h.qx],y:h.y0+data.qpos[h.qy]};if(h.kind==='crate')return {x:data.qpos[h.q],y:data.qpos[h.q+1]};return {x:h.x0,y:h.y0};},
  drive(h,heading,v){compile();data.qpos[h.qyaw]=heading;data.qvel[h.vyaw]=0;data.ctrl[h.ax]=Math.cos(heading)*v;data.ctrl[h.ay]=Math.sin(heading)*v;},
  step(onPair){
   compile();mj.mj_step(model,data);
   const now=new Set(),list=data.contact;
   try{for(let i=0;i<data.ncon;i++){const c=list.get(i),a=geomIds.get(c.geom1),b=geomIds.get(c.geom2);c.delete?.();if(a&&b)now.add([a,b].sort().join('\u0000'));}}finally{list.delete();}
   for(const key of [...now].sort())if(!contacts.has(key)){const [a,b]=key.split('\u0000');onPair(a,b,true);}
   for(const key of [...contacts].sort())if(!now.has(key)){const [a,b]=key.split('\u0000');onPair(a,b,false);}
   contacts=now;
  },
  attach(r,c,heading,p){
   compile();
   data.qpos[c.q]=p.x+Math.cos(heading)*.75;data.qpos[c.q+1]=p.y+Math.sin(heading)*.75;data.qpos[c.q+2]=.3;
   data.qpos[c.q+3]=Math.cos(heading/2);data.qpos[c.q+4]=0;data.qpos[c.q+5]=0;data.qpos[c.q+6]=Math.sin(heading/2);
   for(let i=0;i<6;i++)data.qvel[c.v+i]=0;
   r.held=c;setWeld(r.welds.get(c.id),true);mj.mj_forward(model,data);
  },
  detach(r,c){compile();setWeld(r.welds.get(c.id),false);r.held=null;for(let i=0;i<6;i++)data.qvel[c.v+i]=0;},
  free(){data?.delete();model?.delete();data=model=null;}
 };
}
