// Test-only preload: deliver an actual signal at the first protected-file write.
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
let fired=false;
function signal(stage,path){if(!fired&&process.env.SIM_TEST_SIGNAL_STAGE===stage){const name=String(path);if((stage==='lock'&&name.endsWith('/hub.lock'))||(stage==='capability'&&/\/connection-[^/]+\.json$/.test(name))){fired=true;process.kill(process.pid,process.env.SIM_TEST_SIGNAL);}}}
const open=fs.openSync,write=fs.writeFileSync;
fs.openSync=function(path,...args){const result=open.call(this,path,...args);signal('lock',path);return result;};
fs.writeFileSync=function(path,...args){const result=write.call(this,path,...args);signal('capability',path);return result;};
syncBuiltinESMExports();
