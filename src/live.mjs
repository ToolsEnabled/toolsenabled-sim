import {compareIds} from './order.mjs';
// Wall time schedules commits only. Physics and replay never read this clock.
export function liveOptions(input,scenario){
 if(input===undefined||input===false)return null;
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['budgetMs','stepTicks','activeRobots'].includes(k)))throw new Error('Invalid live options');
 const {budgetMs=120000,stepTicks=60,activeRobots=scenario.robots.map(r=>r.id)}=input;
 if(!Number.isSafeInteger(budgetMs)||budgetMs<1||budgetMs>3600000)throw new Error('Invalid live wall-clock budget');
 if(!Number.isSafeInteger(stepTicks)||stepTicks<1||stepTicks>60)throw new Error('Invalid live step ticks');
 if(!Array.isArray(activeRobots)||!activeRobots.length||new Set(activeRobots).size!==activeRobots.length||activeRobots.some(id=>!scenario.robots.some(r=>r.id===id)))throw new Error('Invalid live active robots');
 return {budgetMs,stepTicks,activeRobots:[...activeRobots].sort(compareIds)};
}
export function createLive({options,getSim,getSequence,enqueue,record,onError}){
 const submitted=new Set(),counts=new Map();let timer,deadline,terminal=null,disposed=false;
 const coordinator={role:'launcher',agentId:'sim-launcher'};
 const attribution=(caller,robotId)=>({caller:{role:caller.role,agentId:caller.agentId},robotId});
 const round=()=>`${getSequence()}:${getSim().status().tick}`;
 const stopped=()=>disposed?'closed':getSim().status().stopReason||terminal;
 function status(){return {...options,round:round(),submitted:[...submitted].sort(compareIds),awaiting:options.activeRobots.filter(id=>!submitted.has(id)),stopped:stopped()};}
 function arm(token){timer=setTimeout(()=>enqueue(()=>{if(disposed||token!==round())return;if(performance.now()<deadline)arm(token);else commit('deadline');}).catch(onError),Math.max(1,Math.ceil(deadline-performance.now())));}
 function reset(){clearTimeout(timer);submitted.clear();counts.clear();const state=getSim().status();terminal=state.stopReason|| (state.complete?'complete':state.remainingTicks===0?'tick-budget':null);if(stopped())return;deadline=performance.now()+options.budgetMs;arm(round());}
 function commit(reason){
  if(stopped())return;clearTimeout(timer);const sim=getSim(),n=Math.min(options.stepTicks,sim.status().remainingTicks);
  const holding=sim.header.assignments.map(a=>a.robotId).filter(id=>!submitted.has(id));
  const committed={kind:'commit',...attribution(coordinator,null),robotIds:sim.header.assignments.map(a=>a.robotId),round:round(),reason,submitted:[...submitted].sort(compareIds),holding,n};
  // Reserve one command slot for these explicit journaled holds.
  for(const robotId of holding){sim.invoke(coordinator,'robot.drive',{robotId,v:0,w:0,duration:n/60});record({kind:'hold',...attribution(coordinator,robotId),round:round(),reason});}
  sim.invoke(coordinator,'sim.step',{n});record(committed);reset();
 }
 function expire(){if(!stopped()&&performance.now()>=deadline)commit('deadline');}
 // A run-wide refusal is terminal now; do not leave a deadline callback queued.
 function invokeRobot(fn){try{return fn();}finally{if(getSim().status().stopReason)clearTimeout(timer);}}
 function check(robotId,token){
  if(token!==round())throw new Error('Stale or missing live round; observe sim.status and replan');
  if(stopped())throw new Error('Live run has stopped');
  if(!options.activeRobots.includes(robotId))throw new Error('Robot is inactive in live mode');
  if(submitted.has(robotId))throw new Error('Robot already submitted this round');
 }
 return {status,reset,expire,command(caller,name,robotId,token,invoke){check(robotId,token);if((counts.get(robotId)||0)>=63)throw new Error('Live command budget exceeded');const result=invokeRobot(invoke);record({kind:'command',...attribution(caller,robotId),round:round(),name});counts.set(robotId,(counts.get(robotId)||0)+1);return result;},submit(caller,robotId,token){check(robotId,token);invokeRobot(()=>getSim().invoke(caller,'robot.submit',{robotId,round:token}));record({kind:'submission',...attribution(caller,robotId),round:round()});submitted.add(robotId);if(submitted.size===options.activeRobots.length)commit('submitted');return {...getSim().status(),live:status()};},close(){disposed=true;clearTimeout(timer);}};
}
