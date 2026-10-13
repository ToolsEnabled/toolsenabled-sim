import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {statSync} from 'node:fs';
import {runCli,cliOption,absoluteInputPath} from '../src/cli-lifecycle.mjs';
export const connectionConfig=connection=>{
 absoluteInputPath(connection,'--connection');
 if(!statSync(connection).isFile())throw new Error('--connection must name an existing file');
 return {command:process.execPath,args:[fileURLToPath(new URL('../src/mcp.mjs',import.meta.url))],env:{SIM_CONNECTION:connection}};
};
export function formatConfig(client,connection){
 const config=connectionConfig(connection);
 if(client==='deepseek')return `- insert:\n    - id: mcp-toolsenabled-sim\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: toolsenabled_sim\n        transport: stdio\n        command: ${JSON.stringify(config.command)}\n        args: ${JSON.stringify(config.args)}\n        env:\n          SIM_CONNECTION: ${JSON.stringify(config.env.SIM_CONNECTION)}\n        toolCallTimeoutMs: 15000\n`;
 if(client==='codex')return `[mcp_servers.toolsenabled_sim]\ncommand = ${JSON.stringify(config.command)}\nargs = ${JSON.stringify(config.args)}\n\n[mcp_servers.toolsenabled_sim.env]\nSIM_CONNECTION = ${JSON.stringify(config.env.SIM_CONNECTION)}\n`;
 return JSON.stringify({mcpServers:{toolsenabled_sim:config}},null,2);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await runCli(async()=>{
 const args=process.argv.slice(2),option=name=>cliOption(args,name);
 const client=option('--client'),connection=option('--connection');
 if(!['claude','codex','cursor','claude-desktop','deepseek'].includes(client)||connection===undefined)throw new Error('Usage: node tools/mcp-config.mjs --client claude|codex|cursor|claude-desktop|deepseek --connection PRIVATE_CONNECTION_JSON');
 console.log(formatConfig(client,connection));
});
