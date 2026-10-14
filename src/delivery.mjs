export const deliveryRule='A crate counts only when released (not held) and fully inside its assigned zone: abs(x - zone.x) <= width/2 - 0.3 and abs(y - zone.y) <= depth/2 - 0.3. The crate is 0.6 m wide/deep. robot.goto moves the robot, and a held crate rides 0.75 m ahead of it in the direction it faces, so send the robot to the stop point 0.75 m short of the zone center, not to the center itself: each deliveryAreas entry lists robotStops for a robot arriving facing east, west, south or north (x east, y south). Release, advance or submit, then verify delivered. There is no additional speed or settling-time test; bounds are conservative on a 1e-6 grid; a crate center at the zone center has the most motion tolerance.';
// A held crate is attached this far ahead of the robot along its heading (src/engines/rapier.mjs, src/engines/mujoco.mjs).
export const carryOffset=.75;

// Guidance is returned to agents, not inserted into historical tick snapshots.
const q=n=>Math.round(n*1e6)/1e6;
function axisBounds(center,size){
 const margin=size/2-.3;
 // Match the scorer's rounded positions and Rapier's float32 body coordinates.
 const inside=n=>Math.abs(n-center)<=margin&&Math.abs(q(Math.fround(n))-center)<=margin;
 let min=Math.ceil((center-margin)*1e6),max=Math.floor((center+margin)*1e6);
 while(!inside(min/1e6))min++;
 while(!inside(max/1e6))max--;
 return {min:min/1e6,max:max/1e6};
}
export function deliveryAreas(zones){
 return zones.map(z=>{
  const x=axisBounds(z.x,z.width),y=axisBounds(z.y,z.depth);
  // The robot stop point that puts the crate center on the zone center depends on the direction the robot faces when it arrives.
  const robotStops={east:{x:q(z.x-carryOffset),y:z.y},west:{x:q(z.x+carryOffset),y:z.y},south:{x:z.x,y:q(z.y-carryOffset)},north:{x:z.x,y:q(z.y+carryOffset)}};
  return {zoneId:z.id,crateSize:.6,center:{x:z.x,y:z.y},centerBounds:{minX:x.min,maxX:x.max,minY:y.min,maxY:y.max},carryOffset,robotStops};
 });
}
