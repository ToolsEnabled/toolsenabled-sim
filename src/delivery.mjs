export const deliveryRule='A crate counts only when released (not held) and fully inside its assigned zone: abs(x - zone.x) <= width/2 - 0.3 and abs(y - zone.y) <= depth/2 - 0.3. The crate is 0.6 m wide/deep. Aim for the zone center, release, advance or submit, then verify delivered. There is no additional speed or settling-time test; bounds are conservative on a 1e-6 grid; aim at the center for motion tolerance.';

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
  return {zoneId:z.id,crateSize:.6,center:{x:z.x,y:z.y},centerBounds:{minX:x.min,maxX:x.max,minY:y.min,maxY:y.max}};
 });
}
