import {readFileSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function dependencyInputs(root){
 const json=file=>JSON.parse(readFileSync(join(root,file),'utf8'));
 const inventory=json('tools/dependency-files.json'),manifest=json('package.json'),lock=json('package-lock.json'),files=[],versions={};
 const names=value=>JSON.stringify(Object.keys(value).sort());
 if(names(inventory)!==names(manifest.dependencies)||names(lock.packages[''].dependencies)!==names(manifest.dependencies))throw Error('Dependency lock/inventory set mismatch');
 for(const [name,dependency] of Object.entries(inventory)){
  if(!/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(name))throw Error('Unsafe dependency name');
  const installed=json(`node_modules/${name}/package.json`),locked=lock.packages[`node_modules/${name}`];
  if(!locked||locked.version!==dependency.version||manifest.dependencies[name]!==dependency.version||lock.packages[''].dependencies[name]!==dependency.version)throw Error('Dependency lock mismatch: '+name);
  if(installed.name!==name||installed.version!==locked.version)throw Error('Dependency identity mismatch: '+name);
  versions[name]=installed.version;
  for(const relative of Object.keys(dependency.files)){
   const file=`node_modules/${name}/${relative}`;
   if(!relative||relative.startsWith('/')||relative.includes('\\')||relative.split('/').some(p=>p==='..'||p==='.'||!p))throw Error('Unsafe dependency file');
   let path=root;for(const part of file.split('/')){path=join(path,part);if(lstatSync(path).isSymbolicLink())throw Error('Symlink refused: '+file);}
   if(!lstatSync(path).isFile())throw Error('Missing dependency file: '+file);
   const {sha256,purpose}=dependency.files[relative];
   if(!['runtime','metadata','license'].includes(purpose)||!/^[0-9a-f]{64}$/.test(sha256)||createHash('sha256').update(readFileSync(path)).digest('hex')!==sha256)throw Error('Dependency hash mismatch: '+file);
   files.push(file);
  }
 }
 return {files:files.sort(),versions};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(dependencyInputs(resolve(process.argv[2]??'.'))));
