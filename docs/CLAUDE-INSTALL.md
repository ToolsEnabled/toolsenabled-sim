# Claude plugin installation

Linux tested; native Windows not yet supported.

Plugin and skill name: `toolsenabled-sim`. Node.js 22+ is required. The reviewed ZIP includes pinned offline dependencies; the runtime never installs packages or downloads a browser. Keep the hub, run logs and private connection files outside the versioned plugin cache. The plugin launches only the stdio connection shim and joins an already running shared hub.

ToolsEnabled is not affiliated with or endorsed by Anthropic. [Privacy](https://toolsenabled.ai/privacy/) · [Support](mailto:support@toolsenabled.ai).

## Start the shared run

From the extracted distribution, the human starts one hub, or the live launcher with a real driver work record:

```sh
node src/hub-cli.mjs --root /absolute/private-sim-run
node tools/live.mjs --root /absolute/another-private-run --work-record /absolute/work-record.json
```

Choose one command for the intended mode. Either accepts `--engine mujoco` to run the shared world on MuJoCo; Rapier is the default. Keep that process running. It prints the **paths** to private connection files, not their capability contents. Give each host the path for its own robot; keep the coordinator file with the coordinator. The file must be owned by the connecting OS account with mode 0600 and an owned, non-writable parent. Existing run roots require owner mode 0700. These POSIX ownership checks are required: native Windows is not supported by this release. For separate-account agents the human deliberately copies only that agent's file into its own private account directory with the required owner/mode.

All configured paths must be absolute. Empty, relative, `~` and drive-relative paths are refused, including `SIM_CONNECTION`. Spaces are literal path characters; do not put shell quotes inside JSON values. A connection file grants the role recorded in it; changing tool arguments never changes that identity. Same-user agent file/shell tools can read private files, so do not treat a skill or project boundary as OS isolation.

## Claude Code

This repository includes `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`; each exposes this repository's root as `toolsenabled-sim`. From a dedicated Git project root for this agent (a subdirectory within another repository shares that repository's local scope):

```sh
claude plugin marketplace add ToolsEnabled/toolsenabled-sim
claude plugin install toolsenabled-sim@toolsenabled-sim -s local --config connection_file=/absolute/private-sim-run/connection-amber.json
claude plugin details toolsenabled-sim@toolsenabled-sim
claude mcp list
```

A Git-backed install copies the repository's default branch at its current commit, which contains source and no dependencies. Claude Code fills them itself: when it installs the plugin it runs `npm ci --ignore-scripts --workspaces=false --no-audit --no-fund` in the installed plugin directory (observed with Claude Code 2.1.296), so the shim can start without a manual step. Only if that directory has no `node_modules` (for example npm was missing or offline during the install), run `npm ci --ignore-scripts --no-audit --no-fund` there yourself. For an offline install, download the release ZIP and its `.sha256` sidecar, verify with `sha256sum -c toolsenabled-sim-0.1.11.zip.sha256`, extract it, then run `claude plugin marketplace add /absolute/extracted/sim` and the same install command. That ZIP includes the pinned dependencies. Review updates before adopting them; a relative-source catalog is not a per-file cryptographic integrity check.

`-s local` keeps registration in this project. The host can launch the shim at session startup and during `claude mcp list`; listing is not an inert configuration read. Distinct robots need distinct connection files and, on one OS account, distinct Claude configuration directories (see below). A second host pointed at the same robot shares that identity and command limits; it is not an additional agent. Disconnecting a shim leaves the owning hub running. End the client normally, then stop the hub with SIGINT/SIGTERM/SIGHUP after all clients finish.

Every install command prints `1 userConfig option not yet set — run /plugin configure toolsenabled-sim@toolsenabled-sim in Claude Code, or pass --config KEY=VALUE.` even though you passed `connection_file`. The unset option is the optional `run_root` (below); the message is expected and the install succeeded. To set both, add `--config run_root=/absolute/private-sim-run` and the message no longer appears. `claude plugin configure toolsenabled-sim@toolsenabled-sim` lists each option and whether it is set.

`claude plugin details toolsenabled-sim@toolsenabled-sim` shows `Hooks (0)`. That count covers only event hooks declared in `hooks/hooks.json`; Sim declares none there and loads its mod through that file's `modules` list instead (`hooks/register.tsx`, described in the README section "What this plugin runs, sends and reads"). `claude plugin validate --strict` analyses the mod, and `claude plugin test .` runs its tests. The same listing counts the eight action commands and the delivery skill together as `Skills (9)`.

The non-secret path option is stored by Claude Code under `pluginConfigs["toolsenabled-sim@toolsenabled-sim"].options.connection_file`. It is passed through `SIM_CONNECTION`, never as a command-line argument. The capability itself stays in the external file. Do not paste the file's contents into settings or prompts.

### Several robots on one OS account

Claude Code stores plugin options per user, not per project. `--config connection_file=…` is written to `settings.json` in the Claude configuration directory (`~/.claude`, or `$CLAUDE_CONFIG_DIR` when set); the project's `.claude/settings.local.json` receives only `enabledPlugins`, even with `-s local`. Installing for a second robot from another project therefore rebinds every project that uses the same configuration directory to the second robot. Claude Code 2.1.296 also ignores `pluginConfigs` written into a project's `.claude/settings.json` or `.claude/settings.local.json`.

Give each robot agent its own Claude configuration directory, and set it for every `claude` command that agent runs (install, `mcp list` and the session itself). For amber:

```sh
export CLAUDE_CONFIG_DIR=/absolute/claude-config-amber
claude plugin marketplace add ToolsEnabled/toolsenabled-sim
claude plugin install toolsenabled-sim@toolsenabled-sim -s local --config connection_file=/absolute/private-sim-run/connection-amber.json
claude mcp list
```

For teal, in another terminal, use `CLAUDE_CONFIG_DIR=/absolute/claude-config-teal` and `connection-teal.json` with the same commands. Each configuration directory has its own settings, installed plugins and sign-in, so sign in once in each. Keep these directories private and outside any shared project.

For a one-off launch, an absolute machine-local `--settings` file also overrides the stored value for that launch only, for example `claude --settings /absolute/amber-sim-settings.json` with this content (do not commit it):

```json
{"pluginConfigs":{"toolsenabled-sim@toolsenabled-sim":{"options":{"connection_file":"/absolute/private-sim-run/connection-amber.json"}}}}
```

Every launch must then pass it: a launch without `--settings` uses the stored value, which is the last robot installed in that configuration directory.

Use `/sim help` for local panes and exact action names; `/toolsenabled-sim:deliver` requests delivery. The optional absolute `run_root` option anchors retained views after clean shutdown deletes connection files. It is used only by the read-only view child, which explicitly receives `SIM_CONNECTION` and `SIM_RUN_ROOT`. See [COMMANDS.md](COMMANDS.md) for every pane, action and Codex equivalent. Invoke `/toolsenabled-sim:toolsenabled-sim` with a general delivery task. The skill reads status/observation, uses the current round, submits, and verifies delivery. Restrict the agent to the intended Sim tools where practical. The live coordinator cannot drive robots. Driver labels must name the actual client; a script is a scripted driver. A successful install or tool handshake is not a successful model-driven delivery.

## Human diagnostics and replay

Sim has **no dashboard or human-control link** to discover or reissue. Its hub prints private connection-file paths to the human's launch terminal. The human starts capture/replay explicitly with local CLI commands; these are unavailable to MCP agents. A replay server's printed capability URL is read-only and belongs in the human's private terminal, not an agent prompt.

Claude Code on the qualified Linux build records shim stderr under `~/.cache/claude-cli-nodejs/<cwd-slug>/mcp-logs-plugin-*/<timestamp>.jsonl`; select the `plugin:toolsenabled-sim:toolsenabled_sim` server. XDG cache settings can change the base. Stderr can appear as an `error` entry even for an upstream informational warning. The human can choose an absolute private `--debug-file` path. Agents with file/shell tools under the same OS account can read these logs; a mode-600 log is not protection from that agent. Do not ask the agent to search logs or connection files for another identity.

For connection recovery, stop the affected client normally, check its absolute file path and the owning hub, then restart that client. If the hub crashed, verify that it has stopped and deliberately move the stale run root aside before starting a new hub and reconfiguring the new private paths. Do not delete an active lease or let an agent seize another connection.

## Codex

Add the repository marketplace with `codex plugin marketplace add ToolsEnabled/toolsenabled-sim`, then install ToolsEnabled Sim from the toolsenabled-sim marketplace in Codex's /plugins browser. The verified ZIP can also be registered with `codex plugin marketplace add /absolute/extracted/sim`. Git-backed installs need the dependency install above; the ZIP includes them.

The `.codex-plugin/plugin.json` uses an inline server with `args:["./src/mcp.mjs"]` and `cwd:"./"`, plus `env_vars:["SIM_CONNECTION"]` to forward the host’s connection path into the MCP subprocess. The tested Codex loader resolves that cwd to the installed plugin root. Set `SIM_CONNECTION` to the absolute private file in the host environment before launching Codex, or use the existing print-only `tools/mcp-config.mjs --client codex --connection /absolute/file` helper for direct registration. Codex does not consume Claude's `user_config`. The inline server uses the same name as the root Claude `.mcp.json` so it overrides that configuration. Root substitution strings are not supported in the tested legacy Codex MCP argv.

The stdio server reads one application environment variable at startup: `SIM_CONNECTION`. It is required, has no default, and missing or empty values fail before reading state. Claude and Desktop explicitly map their required `connection_file` option into this variable; Codex explicitly forwards it. The MCP shim has no optional startup variables, interpreter selectors, or workspace defaults. The separate view CLI also reads optional `SIM_RUN_ROOT`; Claude forwards it from `run_root`, while Codex users may set it or pass `--root` explicitly. The client needs its normal OS prerequisites (`HOME`, `PATH` and a writable temporary directory); `node` must be on `PATH`. Runtime state and robot identity come exclusively from the selected private connection file. Qualification under packaging revision 2.1 uses fresh client configuration and a scrubbed environment, verifies that the selected robot capability reached the intended hub, and proves startup fails when Codex's forwarding declaration is removed.

## Desktop bundle and release metadata

A Claude Desktop bundle can be built with `tools/package-mcpb.py`; no Desktop bundle is attached to the 0.1.11 release, and native installation still needs qualification. The bundle requires Node 22+ and POSIX ownership support. Its manifest restricts native installation to macOS; Windows support needs a separate ownership implementation and qualification. Headless Linux MCP tests do not establish native Desktop acceptance, and including SKILL.md does not establish Desktop skill loading. Local MCP servers are not available in claude.ai chat.

The human imports only the reviewed bundle and supplies the absolute private connection-file path. During future native qualification, confirm shim stderr in `~/Library/Logs/Claude/mcp-server-<server-name>.log` and `mcp.log`. No one-time dashboard link is expected. A development signature proves neither trusted publisher identity nor native installation support.

Unsigned bundles are built twice with pinned mcpb 2.1.2, fixed build time and normalized modes. The development certificate is short-lived, CA:FALSE and codeSigning; its private key is destroyed outside source and handoff directories. Stock mcpb 2.1.2 verification has a known unimplemented PKCS#7 verification path; retain its failure and the independent OpenSSL CMS/tamper receipts. Production signing is an owner action.

Build from a clean committed checkout with the reviewed offline dependencies already present:

```sh
node tools/package.mjs /outside/toolsenabled-sim-0.1.11.zip
python3 tools/package-mcpb.py --mcpb-cli /absolute/pinned-mcpb-2.1.2/dist/cli/cli.js --output /outside/toolsenabled-sim-0.1.11.mcpb
python3 test/packaging-tools.test.py
```

Build again to different output paths and compare bytes. Both packagers require a clean committed checkout and share the source and per-dependency file allowlists. They validate installed names and versions against package-lock.json and every selected file against its reviewed SHA256; receipts report the versions actually packed. Vendored files are limited to traced runtime code, resolver metadata and legal notices; THIRD-PARTY.md lists every shipped dependency file. Transfer handoffs only through `tools/handoff.py copy SOURCE NEW_DESTINATION` after constructing SHA256SUMS, then use `verify` on receipt. The scanner checks unlisted files, archive members and reachable Git bundle blobs; caches, scratch state and signer directories stay outside every packet.

`server.json` is generated outside the product only after the coordinator publishes the qualified source and signed bytes. The release generator requires the handoff’s full `--expected-tree` ID, checks the pushed tag/commit and downloaded artifacts, and verifies every ZIP member against that tree and its dependency hash inventory. The ZIP must have one `sim/` wrapper and the matching plugin identity/version; the signed mcpb must contain exactly the same member bytes. Registry sidecars and development signing digests remain outside this source and the plugin archives; the repository marketplace catalogs ship with the source and ZIP.

For Registry generation, pass `--description 'Control warehouse robots offline with shared MCP tools, delivery guidance and exact replay.'`. This complete listing text is used verbatim. Descriptions outside 1–100 characters are refused; the generator never truncates public wording.

Directory review holds: seven dependency files exceed 256 KiB and include minified JavaScript, Rapier WebAssembly embedded in JavaScript and MuJoCo's standalone `mujoco.wasm` (10,313,475 bytes, loaded only with `--engine mujoco`; its source map, type declarations and multi-threaded build are not shipped); THIRD-PARTY.md names each one. The pruned package is below 512 files and contains no fonts, images, reinstall scripts or third-party skills. The renderer uses Three.js and an externally provided Chromium runtime; no browser binary is bundled. These requirements are disclosed, not treated as directory approval. Source, exact dependency pins and licenses accompany the artifacts.

## Command and Codex reference

| Claude command (view) | What it shows | Codex equivalent |
| --- | --- | --- |
| `/sim` or `/sim status` | Bound identity, score, stop reason, live round and deadline remaining | `!node <sim-dir>/tools/sim-view.mjs status` |
| `/sim help` | Every command, role/mode gate and equivalent | `!node <sim-dir>/tools/sim-view.mjs help` |
| `/sim robots` | Own work, action/caller and delivery bounds; peers' poses and holding only | `!node <sim-dir>/tools/sim-view.mjs robots` |
| `/sim map` | 33×13 map, zone labels and delivery areas | `!node <sim-dir>/tools/sim-view.mjs map` |
| `/sim runs` | Retained results, mode, seed, engine and final hash | `!node <sim-dir>/tools/sim-view.mjs runs --root <absolute-root>` |
| `/sim events [run-NNNN]` | Merged action and round history with real caller attribution | `!node <sim-dir>/tools/sim-view.mjs events --run run-0001` |
| `/sim scenarios [absolute-file]` | Shipped/current scene summaries; optional pure validation | `!node <sim-dir>/tools/sim-view.mjs scenarios --check <absolute-file>` |
| `/sim replay [run-NNNN]` | Exact human-run replay/capture instructions when the root is known | `!node <sim-dir>/tools/sim-view.mjs replay --run run-0001` |
| `/sim connection` | Configured path, owner/mode checks, reachability, role, Node and plugin version | `!node <sim-dir>/tools/sim-view.mjs connection` |

| Claude command (action) | Arguments and gate | Codex skill invocation |
| --- | --- | --- |
| `/toolsenabled-sim:deliver` | Robot: no argument; manual coordinator: explicit robot ID. Deliver the assigned crate only. | `$toolsenabled-sim:toolsenabled-sim deliver [robot]` |
| `/toolsenabled-sim:move` | Robot: x y; manual coordinator: robot x y. Finite coordinates inside the arena and −30…30. | `$toolsenabled-sim:toolsenabled-sim move [robot] <x> <y>` |
| `/toolsenabled-sim:hold` | Robot: no argument; manual coordinator: explicit robot ID. Keep held crate attached. | `$toolsenabled-sim:toolsenabled-sim hold [robot]` |
| `/toolsenabled-sim:submit` | Active live robot only, once per current round. | `$toolsenabled-sim:toolsenabled-sim submit` |
| `/toolsenabled-sim:step` | Manual coordinator only; 1–60 ticks, default 60. | `$toolsenabled-sim:toolsenabled-sim step [n]` |
| `/toolsenabled-sim:assign` | Manual coordinator: robot crate task-id ledger-id. | `$toolsenabled-sim:toolsenabled-sim assign <robot> <crate> <task-id> <ledger-id>` |
| `/toolsenabled-sim:scenario` | Coordinator: absolute JSON file, validated against current assignments. | `$toolsenabled-sim:toolsenabled-sim scenario <absolute-file>` |
| `/toolsenabled-sim:reset` | Coordinator: no arguments. Restart everyone's shared world and round; old logs remain. | `$toolsenabled-sim:toolsenabled-sim reset` |
