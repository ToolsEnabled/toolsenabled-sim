import {constants,openSync,closeSync,fstatSync,lstatSync,readFileSync,realpathSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {checkWindowsPath,createWindowsPrivateDirectory,primeWindowsPaths} from './windows-files.mjs';
const uid=()=>{if(typeof process.geteuid!=='function')throw new Error('POSIX ownership checks are required');return process.geteuid();};
export function makePrivateDirectory(path,{recursive=false}={}){if(process.platform==='win32')createWindowsPrivateDirectory(path,{exclusive:!recursive});else mkdirSync(path,{recursive,mode:0o700});}
export function privateRoot(path){const s=lstatSync(path,{bigint:process.platform==='win32'});if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Run root must be an owned private directory');if(process.platform==='win32')checkWindowsPath(path,s,{directory:true,ownedDirectory:true});else if(s.uid!==uid()||(s.mode&0o777)!==0o700)throw new Error('Run root must be owned by this user with mode 0700');return realpathSync(path);}
export function readConnection(path){
 const parentPath=dirname(path);if(process.platform==='win32')primeWindowsPaths([parentPath,path]);const parent=lstatSync(parentPath,{bigint:process.platform==='win32'});if(!parent.isDirectory()||parent.isSymbolicLink())throw new Error('Connection parent must be private and owned by this user');if(process.platform==='win32')checkWindowsPath(parentPath,parent,{directory:true,readable:true,ownedDirectory:true});else if(parent.uid!==uid()||(parent.mode&0o022))throw new Error('Connection parent must be private and owned by this user');
 // O_NONBLOCK: a FIFO opens at once instead of waiting for a writer, so the regular-file check below refuses it.
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
 try{const s=fstatSync(fd,{bigint:process.platform==='win32'});if(!s.isFile()||s.size>4096)throw new Error('Connection file must be owned by this user with mode 0600');if(process.platform==='win32')checkWindowsPath(path,s);else if(s.uid!==uid()||(s.mode&0o777)!==0o600)throw new Error('Connection file must be owned by this user with mode 0600');return readFileSync(fd,'utf8');}finally{closeSync(fd);}
}
