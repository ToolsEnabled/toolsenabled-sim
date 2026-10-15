import {shellArgument} from '../src/shell-argument.mjs';
import {readerHost} from '../hooks/view.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWindowsEntry,windowsLocalPath} from '../src/windows-files.mjs';

const fileId=9007199254741001n,volume=4294967295n;
const stat={ino:fileId,dev:volume};
const entry=()=>({fileId:String(fileId),volume:String(volume),links:1,directory:false,fileSystem:'NTFS',fixedDrive:true,security:{ownerTrusted:true,ownedByUser:true,private:true,writeRestricted:true,ancestorControlRestricted:true}});
test('Windows descriptor binding preserves exact 64-bit identity and rejects another file or volume',()=>{
 assert.equal(verifyWindowsEntry(entry(),stat).fileId,String(fileId));
 for(const change of [{fileId:String(fileId+1n)},{volume:'1'},{links:2},{directory:true},{fileSystem:'ReFS'},{fixedDrive:false}])assert.throws(()=>verifyWindowsEntry({...entry(),...change},stat),/refused/);
 assert.throws(()=>verifyWindowsEntry(entry(),{ino:Number(fileId),dev:volume}),/refused/);
});
test('private Windows reads require current owner and private ACLs; scenario reads may be public but not writable',()=>{
 for(const change of [{ownerTrusted:false},{ownedByUser:false},{private:false},{writeRestricted:false}]){
  const value=entry();Object.assign(value.security,change);assert.throws(()=>verifyWindowsEntry(value,stat),/refused/);
 }
 const readable=entry();readable.security.private=false;assert.equal(verifyWindowsEntry(readable,stat,{readable:true}),readable);
 readable.security.writeRestricted=false;assert.throws(()=>verifyWindowsEntry(readable,stat,{readable:true}),/refused/);
 const directory=entry();directory.directory=true;directory.security.ownedByUser=false;
 assert.throws(()=>verifyWindowsEntry(directory,stat,{directory:true,ownedDirectory:true}),/refused/);
});
test('native paths require a local drive and reject root-relative, drive-relative, UNC, device and ADS forms',()=>{
 assert.equal(windowsLocalPath('C:\\Users\\normal user\\run'),'C:\\Users\\normal user\\run');
 for(const path of ['C:run','\\run','\\\\host\\share\\run','\\\\?\\C:\\run','C:\\run:stream','~\\run'])assert.throws(()=>windowsLocalPath(path),/local Windows/);
});

test('pane dispatch chooses a native absolute launcher before execution and refuses ambiguous roots',()=>{
 for(const root of ['C:\\Users\\j\\plugin','D:/Apps/plugin'])assert.equal(readerHost(root),'windows');
 for(const root of ['/home/j/plugin','/Applications/plugin'])assert.equal(readerHost(root),'posix');
 for(const root of ['C:relative','\\relative','\\\\server\\plugin','//server/plugin','/C:/mixed','relative','/tmp/back\\slash','/tmp/\u0000'])assert.throws(()=>readerHost(root));
});

test('human command guidance quotes Windows apostrophes without expanding shell syntax',()=>{
 const value="C:\\a b\\that's $literal`text";assert.equal(shellArgument(value,'win32'),"'C:\\a b\\that''s $literal`text'");
 assert.equal(shellArgument("a'b",'linux'),"'a'\\''b'");
});

test('native path component checks preserve ordinary names while refusing aliases, devices and controls',()=>{
 for(const path of ['C:\\Users\\j\\file.json','C:\\Users\\j\\folder','C:/safe/normal'])assert.doesNotThrow(()=>windowsLocalPath(path));
 for(const path of ['C:\\safe\\name.','C:\\safe\\name ','C:\\safe\\..\\other','C:\\safe\\nul.txt','C:\\safe\\bad\u0001name'])assert.throws(()=>windowsLocalPath(path));
});
