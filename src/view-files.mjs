import {constants,openSync,closeSync,fstatSync,readSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {compareIds} from './order.mjs';
import {checkWindowsPath,primeWindowsPaths} from './windows-files.mjs';
export const MAX_READ=512*1024;
export const problem=(message,status=400)=>Object.assign(new Error(message),{status});
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp=s=>[String(s.dev),String(s.ino),String(s.size),String(s.mtimeNs)];
export function file(path){
 // O_NONBLOCK: a FIFO opens at once instead of waiting for a writer, so the regular-file check below refuses it.
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
 try{const s=fstatSync(fd,{bigint:true});if(!s.isFile()||s.size>256n*1024n*1024n)throw problem('Private run file is unavailable.');if(process.platform==='win32')checkWindowsPath(path,s);else if(Number(s.uid)!==process.geteuid()||Number(s.mode&0o777n)!==0o600)throw problem('Private run file is unavailable.');return {fd,size:Number(s.size),stamp:stamp(s)};}
 catch(e){closeSync(fd);throw e;}
}
export function unchanged(f){if(JSON.stringify(stamp(fstatSync(f.fd,{bigint:true})))!==JSON.stringify(f.stamp))throw problem('Run changed. Reload the view.',409);}
export function bytes(f,start,length){const data=Buffer.alloc(length);if(readSync(f.fd,data,0,length,start)!==length)throw problem('Run changed. Reload the view.',409);return data;}
export function privateJSON(path,max=MAX_READ){const f=file(path);try{if(f.size>max)throw problem('Private JSON exceeds its read limit.');const value=JSON.parse(bytes(f,0,f.size));unchanged(f);return value;}finally{closeSync(f.fd);}}
export function ends(path){
 const f=file(path);try{
  if(!f.size)throw problem('Run recording is empty.');
  const head=bytes(f,0,Math.min(f.size,MAX_READ)),end=head.indexOf(10);if(end<0)throw problem('Run header exceeds the view limit.');
  const header=JSON.parse(head.subarray(0,end));
  const tail=bytes(f,Math.max(0,f.size-MAX_READ),Math.min(f.size,MAX_READ));
  if(tail.at(-1)!==10)throw Object.assign(problem('Run recording is incomplete. Reload the view.',409),{incomplete:true});
  const start=tail.lastIndexOf(10,tail.length-2)+1;if(!start&&f.size>MAX_READ)throw problem('Run row exceeds the view limit.');
  const last=JSON.parse(tail.subarray(start,-1));unchanged(f);
  if(header.kind!=='header'||last.kind!=='tick')throw problem('Run recording is unavailable.');
  return {header,last,stamp:f.stamp};
 }finally{closeSync(f.fd);}
}
export function runNames(root){
 const all=readdirSync(root);if(all.length>4096)throw problem('Too many retained runs. Archive older runs before opening history.');
 const names=all.filter(n=>/^run-\d{4,10}$/.test(n)).sort(compareIds).reverse();
 if(process.platform==='win32'&&names.length>256)throw problem('Native Windows history reads at most 256 retained runs. Archive older runs before opening history.');
 if(process.platform==='win32'){
  const paths=[root];
  for(const n of names){const directory=join(root,n);paths.push(directory);for(const name of ['trajectory.jsonl','actions.jsonl','live.jsonl','view-meta.json']){const file=join(directory,name);try{lstatSync(file);paths.push(file);}catch(e){if(e.code!=='ENOENT')throw e;}}}
  for(const name of ['current-run.json']){const file=join(root,name);try{lstatSync(file);paths.push(file);}catch(e){if(e.code!=='ENOENT')throw e;}}
  primeWindowsPaths(paths);
 }
 for(const n of names){const file=join(root,n),s=lstatSync(file,{bigint:process.platform==='win32'});if(!s.isDirectory()||s.isSymbolicLink())throw problem('Private run directory is unavailable.');if(process.platform==='win32')checkWindowsPath(file,s,{directory:true,ownedDirectory:true});else if(s.uid!==process.geteuid()||(s.mode&0o777)!==0o700)throw problem('Private run directory is unavailable.');}
 return names;
}
export function number(value,fallback,max){if(value===undefined)return fallback;if(!/^\d+$/.test(value)||!Number.isSafeInteger(+value)||+value>max)throw problem('Invalid view page.');return +value;}
export function checkRevision(query,revision){if(query.revision&&query.revision!==revision)throw problem('Run changed. Reload the view.',409);}
