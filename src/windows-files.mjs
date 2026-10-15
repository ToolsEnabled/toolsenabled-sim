import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {win32} from 'node:path';
import {tmpdir,homedir} from 'node:os';

const helper=fileURLToPath(new URL('../native/windows-private-files.ps1',import.meta.url));
const inspected=new Map();
export function windowsLocalPath(value){
 if(typeof value!=='string'||!/^[a-z]:[\\/]/i.test(value)||/^\\\\/.test(value)||value.slice(2).includes(':'))throw Error('Use a fully qualified local Windows drive path.');
 for(const part of value.slice(3).split(/[\\/]/).filter(Boolean)){if(part==='.'||part==='..'||/[<>"|?*\x00-\x1f]|[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))throw Error('Unsupported Windows path component.');}
 return win32.resolve(value);
}
function query(paths,operation='inspect',{exclusive=false}={}){
 const systemRoot=process.env.SystemRoot;
 if(typeof systemRoot!=='string'||!/^[a-z]:\\Windows$/i.test(systemRoot))throw Error('Windows private files require the system Windows PowerShell 5.1 path.');
 const result=spawnSync(win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper],{
  input:JSON.stringify({operation,paths,...(operation==='create-directory'?{exclusive}:{})}),encoding:'utf8',timeout:5000,maxBuffer:8*1024*1024,windowsHide:true,
  env:{SystemRoot:systemRoot,WINDIR:systemRoot,USERPROFILE:homedir(),TEMP:tmpdir(),TMP:tmpdir()}
 });
 let answer;try{answer=JSON.parse(String(result.stdout||'').trim().replace(/^\uFEFF/,''));}catch{}
 if(result.error||result.status!==0||answer?.ok!==true||!Array.isArray(answer.entries)||answer.entries.length!==paths.length)throw Error('Windows private file ownership, ACL or identity could not be verified.');
 for(let i=0;i<paths.length;i++){
  const entry=answer.entries[i],security=entry?.security;
  if(entry?.path!==paths[i]||!/^\d+$/.test(entry.fileId||'')||!/^\d+$/.test(entry.volume||'')||!Number.isInteger(entry.links)||typeof entry.directory!=='boolean'||!security||['private','ownerTrusted','ownedByUser','writeRestricted','ancestorControlRestricted'].some(k=>typeof security[k]!=='boolean'))throw Error('Windows security helper returned an invalid identity.');
  inspected.set(paths[i],entry);
 }
}
export function primeWindowsPaths(paths){if(process.platform==='win32'&&paths.length)query([...new Set(paths.map(windowsLocalPath))]);}
export function clearWindowsInspection(){inspected.clear();}
export function createWindowsPrivateDirectory(path,{exclusive=false}={}){path=windowsLocalPath(path);query([path],'create-directory',{exclusive});}
export function verifyWindowsEntry(entry,stat,{directory=false,readable=false,ownedDirectory=false}={}){
 const security=entry?.security;
 const matches=entry&&entry.fileId===String(stat.ino)&&entry.volume===String(stat.dev);
 if(!matches||entry.directory!==directory||!directory&&entry.links!==1||!security?.ownerTrusted||!security.writeRestricted||!readable&&!security.private||(!directory||ownedDirectory)&&!security.ownedByUser)throw Error('Windows private file ownership, ACL or identity was refused.');
 return entry;
}
export function checkWindowsPath(path,stat,{directory=false,readable=false,ownedDirectory=false}={}){
 path=windowsLocalPath(path);
 let entry=inspected.get(path);
 const matches=row=>row&&row.fileId===String(stat.ino)&&row.volume===String(stat.dev);
 if(!matches(entry)){query([path]);entry=inspected.get(path);}
 return verifyWindowsEntry(entry,stat,{directory,readable,ownedDirectory});
}
