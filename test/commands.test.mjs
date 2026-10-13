import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const names=['deliver','move','hold','submit','reset','step','assign','scenario'];
test('native action commands have scoped prompts, literal arguments and normal approvals',async()=>{
 for(const name of names){
  const text=await readFile(new URL(`../commands/${name}.md`,import.meta.url),'utf8');
  assert.match(text,/^---\ndescription: .+/);assert.match(text,/disable-model-invocation: true/);
  assert.match(text,/sim\.status/);assert.match(text,/bound/);assert.match(text,/normal tool approvals/);
  assert.doesNotMatch(text,/allowed-tools:|!`|\$\{|Bash\(/);
  if(['deliver','move'].includes(name))assert.match(text,/\$ARGUMENTS/);
 }
 const deliver=await readFile(new URL('../commands/deliver.md',import.meta.url),'utf8');
 assert.match(deliver,/robot\.release/);assert.match(deliver,/width\/2 - 0\.3/);assert.match(deliver,/verify.*delivered/);
});
test('every command has matching docs and archived views have an explicit optional root',async()=>{
 const plugin=JSON.parse(await readFile(new URL('../.claude-plugin/plugin.json',import.meta.url),'utf8'));
 assert.equal(plugin.userConfig.run_root.required,false);assert.match(plugin.userConfig.run_root.description,/Absolute/);
 const docs=await readFile(new URL('../docs/COMMANDS.md',import.meta.url),'utf8');
 for(const name of names)assert.ok(docs.includes('/toolsenabled-sim:'+name));
 for(const name of ['help','status','robots','map','runs','events','scenarios','replay','connection'])assert.ok(docs.includes('/sim '+name));
 assert.ok(docs.includes('$toolsenabled-sim:toolsenabled-sim'));assert.ok(docs.includes('SIM_RUN_ROOT'));assert.ok(docs.includes('next model turn'));
});
