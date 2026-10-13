import {constants,openSync,closeSync,fstatSync,readSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {compareIds} from './order.mjs';
export const MAX_READ=512*1024;
export const problem=(message,status=400)=>Object.assign(new Error(message),{status});
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp=s=>[String(s.dev),String(s.ino),String(s.size),String(s.mtimeNs)];
export function file(path){
 // O_NONBLOCK: a FIFO opens at once instead of waiting for a writer, so the regular-file check below refuses it.
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const s=fstatSync(fd,{bigint:true});if(!s.isFile()||Number(s.uid)!==process.geteuid()||Number(s.mode&0o777n)!==0o600||s.size>256n*1024n*1024n)throw problem('Private run file is unavailable.');return {fd,size:Number(s.size),stamp:stamp(s)};}
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
 for(const n of names){const s=lstatSync(join(root,n));if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.geteuid()||(s.mode&0o777)!==0o700)throw problem('Private run directory is unavailable.');}
 return names;
}
export function number(value,fallback,max){if(value===undefined)return fallback;if(!/^\d+$/.test(value)||!Number.isSafeInteger(+value)||+value>max)throw problem('Invalid view page.');return +value;}
export function checkRevision(query,revision){if(query.revision&&query.revision!==revision)throw problem('Run changed. Reload the view.',409);}
