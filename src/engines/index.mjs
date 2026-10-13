import {createRapierWorld,RAPIER_ENGINE} from './rapier.mjs';
// Physics engine choice. Rapier is built in and the default; MuJoCo is the robotics-grade option.
export const ENGINES={rapier:RAPIER_ENGINE,mujoco:'mujoco@3.14.0'};
export const engineName=id=>Object.keys(ENGINES).find(name=>ENGINES[name]===id);
// Every entry point that takes an engine name refuses an unknown one with this message before any state exists.
export function checkEngine(name){if(!Object.hasOwn(ENGINES,name))throw new Error('Unknown physics engine: use rapier or mujoco');return name;}
export async function createWorld(name,dt){
 if(checkEngine(name)==='rapier')return createRapierWorld(dt);
 const {createMujocoWorld}=await import('./mujoco.mjs');return createMujocoWorld(dt);
}
