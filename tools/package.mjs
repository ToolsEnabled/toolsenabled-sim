import {readdir,readFile,stat,mkdir} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createGzip,deflateRawSync} from 'node:zlib';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.argv[2];if(!output)throw new Error('Usage: node tools/package.mjs OUTPUT.zip|OUTPUT.tar.gz');
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
if(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw new Error('Commit source before packaging');
async function walk(path){const files=[];for(const item of await readdir(join(root,path),{withFileTypes:true})){if(item.isSymbolicLink())continue;const p=`${path}/${item.name}`;if(item.isDirectory())files.push(...await walk(p));else if(item.isFile())files.push(p);}return files;}
const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const files=[...tracked];for(const name of Object.keys(manifest.dependencies).sort())files.push(...await walk(`node_modules/${name}`));
files.sort();
function tarHeader(name,size){
 const header=Buffer.alloc(512);let prefix='';if(Buffer.byteLength(name)>100){const split=name.lastIndexOf('/');prefix=name.slice(0,split);name=name.slice(split+1);}if(Buffer.byteLength(name)>100||Buffer.byteLength(prefix)>155)throw new Error('Archive path too long');
 function string(offset,length,value){header.write(value,offset,length,'utf8');}function octal(offset,length,value){string(offset,length,value.toString(8).padStart(length-1,'0')+'\0');}
 string(0,100,name);octal(100,8,0o644);octal(108,8,0);octal(116,8,0);octal(124,12,size);octal(136,12,0);string(148,8,'        ');string(156,1,'0');string(257,6,'ustar\0');string(263,2,'00');string(345,155,prefix);
 const sum=header.reduce((s,b)=>s+b,0);string(148,8,sum.toString(8).padStart(6,'0')+'\0 ');return header;
}
async function* archive(){for(const file of files){const data=await readFile(join(root,file));yield tarHeader(`sim/${file}`,data.length);yield data;if(data.length%512)yield Buffer.alloc(512-data.length%512);}yield Buffer.alloc(1024);}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let value=0xffffffff;for(const byte of data)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
async function* zipArchive(){
 const central=[];let offset=0;
 for(const file of files){
  const name=Buffer.from(`sim/${file}`),data=await readFile(join(root,file)),compressed=deflateRawSync(data,{level:9}),crc=crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(0x21,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(0x314,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(8,10);entry.writeUInt16LE(0x21,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE((0o100644*65536)>>>0,38);entry.writeUInt32LE(offset,42);central.push(entry,name);
  yield local;yield name;yield compressed;offset+=local.length+name.length+compressed.length;
 }
 const size=central.reduce((n,b)=>n+b.length,0);for(const b of central)yield b;
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);yield end;
}
await mkdir(dirname(resolve(output)),{recursive:true});
if(output.endsWith('.zip'))await pipeline(Readable.from(zipArchive()),createWriteStream(resolve(output),{flags:'wx'}));
else await pipeline(Readable.from(archive()),createGzip({level:9}),createWriteStream(resolve(output),{flags:'wx'}));
console.log(JSON.stringify({output:resolve(output),files:files.length,bytes:(await stat(output)).size,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dependencies:manifest.dependencies}));
