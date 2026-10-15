import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {writeFileSync,linkSync,symlinkSync,rmSync,statSync} from 'node:fs';
import {makePrivateDirectory,privateRoot,readConnection} from '../src/private-files.mjs';
import {clearWindowsInspection} from '../src/windows-files.mjs';
const native=process.platform==='win32';
const shell=native?join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'):'pwsh';
const available=spawnSync(shell,['-NoLogo','-NoProfile','-NonInteractive','-Command','exit 0'],{timeout:10000,windowsHide:true}).status===0;
test('ancestor policy rejects untrusted ownership/control and conservatively interprets raw DACL grants',{skip:!available,timeout:30000},()=>{
 const run=spawnSync(shell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./fixtures/windows-ancestor.ps1',import.meta.url)),...(native?['-RawDescriptors']:[])],{encoding:'utf8',timeout:25000,windowsHide:true});
 assert.equal(run.status,0,run.stderr||run.stdout);const result=JSON.parse(run.stdout.trim().replace(/^\uFEFF/,''));assert.equal(result.passed,result.total);assert.ok(result.passed>=(native?30:13));assert.equal(result.rawDescriptors,native);
});
test('native private directories and opened files enforce owner, DACL, exact identity, one link and local paths',{skip:!native,timeout:90000},()=>{
 const root=join(tmpdir(),'sim-private-native-'+randomUUID());
 try{
  makePrivateDirectory(root,{recursive:true});assert.equal(privateRoot(root).toLowerCase(),root.toLowerCase());
  const file=join(root,'connection.json'),text=JSON.stringify({token:'local-fixture'});writeFileSync(file,text,{flag:'wx',mode:0o600});clearWindowsInspection();assert.equal(readConnection(file),text);
  const grant=(path,action,rights='Read')=>{const result=spawnSync(shell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./fixtures/windows-grant.ps1',import.meta.url)),'-Path',path,'-Action',action,'-Rights',rights],{encoding:'utf8',timeout:15000,windowsHide:true});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
  const exposed=grant(file,'Grant');clearWindowsInspection();assert.throws(()=>readConnection(file),/Windows private/);assert.equal(grant(file,'Describe'),exposed);grant(file,'Remove');
  const ancestor=join(root,'ancestor');makePrivateDirectory(ancestor);const child=join(ancestor,'child');makePrivateDirectory(child);
  for(const rights of ['DeleteSubdirectoriesAndFiles','WriteAttributes']){const changed=grant(ancestor,'Grant',rights);clearWindowsInspection();assert.throws(()=>privateRoot(child),/Windows private/);assert.equal(grant(ancestor,'Describe'),changed);grant(ancestor,'Remove');}
  const hardlink=join(root,'hardlink.json');linkSync(file,hardlink);clearWindowsInspection();assert.throws(()=>readConnection(file),/Windows private/);rmSync(hardlink);
  const target=join(root,'target');makePrivateDirectory(target);const junction=join(root,'junction');symlinkSync(target,junction,'junction');clearWindowsInspection();assert.throws(()=>privateRoot(junction));
  // Both existing private data and its security remain untouched by exclusive creation refusal.
  clearWindowsInspection();assert.throws(()=>makePrivateDirectory(root));assert.equal(statSync(file).nlink,1);
 }finally{rmSync(root,{recursive:true,force:true});clearWindowsInspection();}
});
