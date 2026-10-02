import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function checkDependencyTrace(root,directory){
 const inventory=JSON.parse(readFileSync(join(root,'tools/dependency-files.json'),'utf8')),loaded=new Set(),required=new Set(),allowed=new Set();
 for(const name of readdirSync(directory)){if(name.endsWith('.jsonl'))for(const line of readFileSync(join(directory,name),'utf8').trim().split('\n').filter(Boolean)){const entry=JSON.parse(line);if(entry.kind==='module'||entry.kind==='server-asset')loaded.add(entry.file);}}
 for(const [name,dependency] of Object.entries(inventory))for(const [relative,{purpose}] of Object.entries(dependency.files)){
  const file=`node_modules/${name}/${relative}`;allowed.add(file);if(purpose==='runtime')required.add(file);else if(!['metadata','license'].includes(purpose))throw Error('Invalid dependency purpose');
 }
 const unloaded=[...required].filter(file=>!loaded.has(file)),unshipped=[...loaded].filter(file=>!allowed.has(file));
 if(!loaded.size||unloaded.length||unshipped.length)throw Error(JSON.stringify({unloaded,unshipped,loaded:loaded.size}));
 return {status:'PASS',loaded:[...loaded].sort(),runtimeFiles:required.size,requiredMetadataOrNotices:allowed.size-required.size};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(checkDependencyTrace(resolve(process.argv[2]),resolve(process.argv[3])),null,2));
