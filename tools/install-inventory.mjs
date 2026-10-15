// Maintainer-only integrity census. No download, dependency install or program execution.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=JSON.parse(readFileSync(join(root,'tools/package-files.json'),'utf8'));
const rows=Object.fromEntries(files.filter(file=>file!=='tools/install-files.json').map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));
const file=join(root,'tools/install-files.json'),text=JSON.stringify(rows,null,2)+'\n';
if(process.argv.includes('--check')){if(readFileSync(file,'utf8')!==text)throw Error('Installation file inventory is stale');}else writeFileSync(file,text);
