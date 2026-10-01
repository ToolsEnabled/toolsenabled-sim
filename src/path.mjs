// Stable 0.5 m grid, fixed neighbour order and deterministic tie-breaking.
export function planPath(start,target,scenario,blocked,radius=.4,{bounded=true}={}){
 let work=0;const spend=()=>{if(bounded&&++work>50000)throw new Error('Path planning work budget exceeded; choose a nearer waypoint or simplify the scene');};
 const clear=(x,y)=>{spend();return Math.abs(x)<scenario.arena.width/2-radius&&Math.abs(y)<scenario.arena.depth/2-radius&&!blocked.some(b=>{spend();return Math.abs(x-b.x)<b.width/2+radius&&Math.abs(y-b.y)<b.depth/2+radius;});};
 const segment=(a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/.1));for(let i=0;i<=n;i++)if(!clear(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n))return false;return true;};
 if(!clear(target.x,target.y))throw new Error('Target is obstructed');
 if(segment(start,target))return [target];
 const key=(x,y)=>`${x},${y}`, origin=[Math.round(start.x*2),Math.round(start.y*2)], goal=[Math.round(target.x*2),Math.round(target.y*2)];
 const open=[origin], visited=new Set([key(...origin)]), prev=new Map();let found,head=0;
 while(head<open.length&&visited.size<16000){const p=open[head++];if(p[0]===goal[0]&&p[1]===goal[1]){found=p;break;}
  for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){const q=[p[0]+dx,p[1]+dy],k=key(...q);if(visited.has(k)||!clear(q[0]/2,q[1]/2))continue;visited.add(k);prev.set(k,p);open.push(q);}
 }
 if(!found)throw new Error('No bounded path to target');
 const path=[target];for(let p=found;key(...p)!==key(...origin);p=prev.get(key(...p)))path.unshift({x:p[0]/2,y:p[1]/2});
 // Connect the exact starting pose and target, then simplify line-of-sight.
 if(!segment(start,path[0]))throw new Error('Start has no collision-free grid connection');
 const simplified=[];let from=start;while(path.length){let i=path.length-1;while(i>0&&!segment(from,path[i]))i--;const next=path[i];if(!segment(from,next))throw new Error('Blocked path segment');simplified.push(next);path.splice(0,i+1);from=next;}
 return simplified;
}
