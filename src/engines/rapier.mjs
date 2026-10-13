import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js';
// Rapier engine: the original Sim physics. Every call and its order matches the pre-engine
// code exactly, so trajectories recorded before the engine option replay byte-identically.
export const RAPIER_ENGINE='rapier3d-compat@0.17.3';
let initialized;
export async function createRapierWorld(dt){
 initialized??=RAPIER.init(); await initialized;
 const world=new RAPIER.World({x:0,y:0,z:0});world.timestep=dt;
 const queue=new RAPIER.EventQueue(true),names=new Map();
 return {
  id:RAPIER_ENGINE,
  add(item,kind){
   const moving=kind!=='obstacle';const desc=moving?RAPIER.RigidBodyDesc.dynamic():RAPIER.RigidBodyDesc.fixed();
   desc.setTranslation(item.x,.3,item.y);
   if(moving)desc.enabledTranslations(true,false,true).lockRotations().setCanSleep(false).setLinearDamping(0);
   const body=world.createRigidBody(desc);
   const shape=kind==='robot'?RAPIER.ColliderDesc.cylinder(.3,.33):RAPIER.ColliderDesc.cuboid((item.width||.6)/2,.3,(item.depth||.6)/2);
   shape.setFriction(0).setRestitution(0).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);if(moving)shape.setMass(kind==='robot'?50:1);
   const collider=world.createCollider(shape,body);names.set(collider.handle,item.id);return {body,collider,joint:null};
  },
  count:()=>names.size,
  position(h){const p=h.body.translation();return {x:p.x,y:p.z};},
  drive(h,heading,v){h.body.setRotation({x:0,y:-Math.sin(heading/2),z:0,w:Math.cos(heading/2)},true);h.body.setLinvel({x:Math.cos(heading)*v,y:0,z:Math.sin(heading)*v},true);},
  step(onPair){world.step(queue);queue.drainCollisionEvents((a,b,started)=>onPair(names.get(a),names.get(b),started));},
  attach(r,c,heading,p){
   c.body.setTranslation({x:p.x+Math.cos(heading)*.75,y:.3,z:p.y+Math.sin(heading)*.75},true);
   c.body.setRotation(r.body.rotation(),true);
   const frame={x:0,y:0,z:0,w:1};
   r.joint=world.createImpulseJoint(RAPIER.JointData.fixed({x:.75,y:0,z:0},frame,{x:0,y:0,z:0},frame),r.body,c.body,true);
   r.joint.setContactsEnabled(false);
  },
  detach(r,c){world.removeImpulseJoint(r.joint,true);r.joint=null;c.body.setLinvel({x:0,y:0,z:0},true);},
  free(){queue.free();world.free();}
 };
}
