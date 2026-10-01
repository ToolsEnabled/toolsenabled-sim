import {constants,openSync,closeSync,fstatSync,lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname} from 'node:path';
const uid=()=>{if(typeof process.geteuid!=='function')throw new Error('POSIX ownership checks are required');return process.geteuid();};
export function privateRoot(path){const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==uid()||(s.mode&0o777)!==0o700)throw new Error('Run root must be owned by this user with mode 0700');return realpathSync(path);}
export function readConnection(path){
 const parent=lstatSync(dirname(path));if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==uid()||(parent.mode&0o022))throw new Error('Connection parent must be private and owned by this user');
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=fstatSync(fd);if(!s.isFile()||s.uid!==uid()||(s.mode&0o777)!==0o600||s.size>4096)throw new Error('Connection file must be owned by this user with mode 0600');return readFileSync(fd,'utf8');}finally{closeSync(fd);}
}
