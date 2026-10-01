const workId={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$',minLength:1,maxLength:128};
export const id={type:'string',pattern:'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$',minLength:1,maxLength:48};
export const num=(minimum,maximum)=>({type:'number',minimum,maximum});
export const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
export const arr=(items,minItems,maxItems)=>({type:'array',items,minItems,maxItems});
const color={type:'string',pattern:'^#[0-9a-fA-F]{6}$'};
const pos={id,x:num(-50,50),y:num(-50,50)};
export const scenarioSchema=obj({
 version:{const:1},name:{type:'string',minLength:1,maxLength:80,pattern:'^[A-Za-z0-9 /_.:+-]+(?: · [A-Za-z0-9 /_.:+-]+)?$'},seed:{type:'integer',minimum:0,maximum:4294967295},
 arena:obj({width:num(6,60),depth:num(6,60)}),
 robots:arr(obj({...pos,heading:num(-Math.PI,Math.PI),color}),3,4),
 crates:arr(obj({...pos,zone:id}),1,32),
 zones:arr(obj({...pos,label:{type:'string',minLength:1,maxLength:32,pattern:'^[A-Za-z0-9 /_-]+$'},width:num(1,8),depth:num(1,8),color}),1,16),
 obstacles:arr(obj({...pos,width:num(.2,20),depth:num(.2,20)}),0,32)
});
export const assignmentSchema=arr(obj({robotId:id,agentId:id,driverLabel:{type:'string',minLength:1,maxLength:27,pattern:'^[A-Za-z0-9 /_-]+$'},crateId:id,taskId:workId,ledgerId:workId},['robotId','agentId','crateId','taskId','ledgerId']),3,4);
// Historical schemas apply only when reading/replaying version-1 recordings.
const legacyScenarioSchema=structuredClone(scenarioSchema);delete legacyScenarioSchema.properties.name.pattern;
const legacyAssignmentSchema=structuredClone(assignmentSchema);
for(const field of ['taskId','ledgerId'])legacyAssignmentSchema.items.properties[field]={type:'string',minLength:1,maxLength:128};
export function schemasForVersion(version=2){
 if(version===1)return {scenario:legacyScenarioSchema,assignments:legacyAssignmentSchema};
 if(version===2)return {scenario:scenarioSchema,assignments:assignmentSchema};
 throw new Error('Unsupported recording schema version');
}
export function validate(schema,value,path='input'){
 const fail=message=>{throw new Error(`${path}: ${message}`);};
 if('const' in schema&&value!==schema.const)fail(`must equal ${schema.const}`);
 if(schema.type==='object'){
  if(value===null||Array.isArray(value)||typeof value!=='object')fail('must be an object');
  for(const k of schema.required||[])if(!Object.hasOwn(value,k))fail(`missing ${k}`);
  for(const k of Object.keys(value)){if(!Object.hasOwn(schema.properties,k))fail(`unknown field ${k}`);validate(schema.properties[k],value[k],`${path}.${k}`);}
 }else if(schema.type==='array'){
  if(!Array.isArray(value)||value.length<schema.minItems||value.length>schema.maxItems)fail('array length out of bounds');
  value.forEach((x,i)=>validate(schema.items,x,`${path}[${i}]`));
 }else if(schema.type==='number'||schema.type==='integer'){
  if(!Number.isFinite(value)||(schema.type==='integer'&&!Number.isSafeInteger(value))||value<schema.minimum||value>schema.maximum)fail('number out of bounds');
 }else if(schema.type==='string'){
  if(typeof value!=='string'||value.length<(schema.minLength||0)||value.length>(schema.maxLength||1024)||(schema.pattern&&!new RegExp(schema.pattern).test(value)))fail('invalid string');
 }
 return value;
}
const robot={robotId:id};
const round={type:'string',pattern:'^[0-9]+:[0-9]+$',maxLength:32};
const command=properties=>obj({...properties,round},Object.keys(properties));
const specs=[
 ['sim.observe','Observe the owned robot pose, nearby objects, contacts and ASCII map.',obj(robot),false],
 ['robot.drive','Set differential drive velocity for a bounded number of simulation seconds.',command({...robot,v:num(-2,2),w:num(-Math.PI,Math.PI),duration:num(1/60,5)}),false],
 ['robot.goto','Follow an obstacle-aware path to an arena coordinate at up to 1.5 m/s.',command({...robot,x:num(-30,30),y:num(-30,30)}),false],
 ['robot.grab','Attach an assigned crate within 0.85 m of the robot front.',command({...robot,crateId:id}),false],
 ['robot.release','Release the held crate; a delivery scores only inside its labeled zone.',command(robot),false],
 ['robot.submit','Live mode: finish commands for this round; the launcher steps when every active robot submits or its wall-clock budget expires.',obj({...robot,round}),false,true],
 ['sim.status','Read score, simulation time, delivered crates, collision count and tick budget.',obj({}),false],
 ['sim.step','Coordinator: advance all robots together by 1–60 fixed ticks.',obj({n:{type:'integer',minimum:1,maximum:60}}),true],
 ['sim.reset','Coordinator: begin a new run with the same scene, seed and assignments.',obj({}),true],
 ['sim.scenario','Coordinator: start a fresh run from a validated JSON scenario and assignment record.',obj({scenario:scenarioSchema,assignments:assignmentSchema}),true],
 ['sim.assign','Coordinator: assign another crate and Fleet task/ledger IDs while keeping the agent mapping stable.',obj({robotId:id,crateId:id,taskId:workId,ledgerId:workId}),true],
 ['sim.assignments','Coordinator: read the current work record and stable agent to robot mapping.',obj({}),true]
];
export const tools=specs.map(([name,description,inputSchema,coordinator,liveOnly=false])=>({name,description,inputSchema,annotations:{readOnlyHint:['sim.observe','sim.status','sim.assignments'].includes(name),destructiveHint:false,idempotentHint:['sim.observe','sim.status','sim.assignments'].includes(name),openWorldHint:false},coordinator,liveOnly}));
export function toolList(role,{live=false}={}){
 return tools.filter(t=>(live||!t.liveOnly)&&(!t.coordinator||['human','coordinator'].includes(role))&&(!live||(!['sim.step','sim.assign'].includes(t.name)&&(!t.name.startsWith('robot.')||role==='robot')))).map(({coordinator,liveOnly,...t})=>{
  const result=structuredClone(t);if(live&&t.name.startsWith('robot.')&&!result.inputSchema.required.includes('round'))result.inputSchema.required.push('round');return result;
 });
}
export function validateCall(identity,name,args,{live=false,formatVersion=2}={}){
 const t=tools.find(t=>t.name===name); if(!t)throw new Error('Unknown tool');
 if(!identity||!['human','coordinator','robot','launcher'].includes(identity.role))throw new Error('Unauthorized identity');
 if(t.liveOnly&&!live)throw new Error('Tool requires live mode');
 if(live&&name.startsWith('robot.')&&!['robot','launcher'].includes(identity.role))throw new Error('Live controls require the owned robot caller');
 if(t.coordinator&&!['human','coordinator','launcher'].includes(identity.role))throw new Error('Coordinator role required');
 const schema=structuredClone(t.inputSchema);if(live&&identity.role==='robot'&&name.startsWith('robot.')&&!schema.required.includes('round'))schema.required.push('round');
 if(formatVersion===1&&name==='sim.assign')for(const field of ['taskId','ledgerId'])schema.properties[field]=legacyAssignmentSchema.items.properties[field];
 validate(schema,args);
 if(args.robotId&&identity.role==='robot'&&args.robotId!==identity.robotId)throw new Error('Robot ownership violation');
 return t;
}
