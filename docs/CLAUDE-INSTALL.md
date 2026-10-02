# Claude plugin installation

Plugin and skill name: `toolsenabled-sim`. Node.js 22+ is required. The reviewed ZIP includes pinned offline dependencies; the runtime never installs packages or downloads a browser. Keep the hub, run logs and private connection files outside the versioned plugin cache. The plugin launches only the stdio connection shim and joins an already running shared hub.

ToolsEnabled is not affiliated with or endorsed by Anthropic. [Privacy](https://toolsenabled.ai/legal/privacy/) · [Support](mailto:support@toolsenabled.ai).

## Start the shared run

From the extracted distribution, the human starts one hub, or the live launcher with a real driver work record:

```sh
node src/hub-cli.mjs --root /absolute/private-sim-run
node tools/live.mjs --root /absolute/another-private-run --work-record /absolute/work-record.json
```

Choose one command for the intended mode. Keep that process running. It prints the **paths** to private connection files, not their capability contents. Give each host the path for its own robot; keep the coordinator file with the coordinator. The file must be owned by the connecting OS account with mode 0600 and an owned, non-writable parent. Existing run roots require owner mode 0700. These POSIX ownership checks are required: native Windows is not supported by this release. For separate-account agents the human deliberately copies only that agent's file into its own private account directory with the required owner/mode.

All configured paths must be absolute. Empty, relative, `~` and drive-relative paths are refused, including `SIM_CONNECTION`. Spaces are literal path characters; do not put shell quotes inside JSON values. A connection file grants the role recorded in it; changing tool arguments never changes that identity. Same-user agent file/shell tools can read private files, so do not treat a skill or project boundary as OS isolation.

## Claude Code

Use only a marketplace snapshot whose commit or packet SHA256 was supplied through the reviewed release handoff. Verify its SOURCE-PINS and every file hash, run its private-key scan, then add the verified absolute directory. Relative-source catalogs have no client-enforced per-entry digest; the external inventory check is required. For a published archive entry, confirm the exact release ZIP digest. Keep automatic catalog updates disabled until replacement bytes are reviewed. Do not substitute a moving marketplace URL or an unpublished tag for this verification.

From a dedicated Git project root for this agent (a subdirectory within another repository shares that repository’s local scope):

```sh
claude plugin marketplace add /absolute/verified-marketplace
claude plugin install toolsenabled-sim@toolsenabled -s local --config connection_file=/absolute/private-sim-run/connection-amber.json
claude plugin details toolsenabled-sim@toolsenabled
claude mcp list
```

These commands require the verified catalog to contain the qualified Sim entry. This source does not ship a future public entry. The coordinator generates it from published source and final artifact hashes.

`-s local` keeps registration in this project. The host can launch the shim at session startup and during `claude mcp list`; listing is not an inert configuration read. Distinct robots need distinct connection files and project configurations. A second host pointed at the same robot shares that identity and command limits; it is not an additional agent. Disconnecting a shim leaves the owning hub running. End the client normally, then stop the hub with SIGINT/SIGTERM/SIGHUP after all clients finish.

The non-secret path option is stored by Claude Code under `pluginConfigs["toolsenabled-sim@toolsenabled"].options.connection_file`. It is passed through `SIM_CONNECTION`, never as a command-line argument. The capability itself stays in the external file. Do not paste the file's contents into settings or prompts. For private per-project option overrides, use an absolute machine-local `--settings` file; do not commit it:

```json
{"pluginConfigs":{"toolsenabled-sim@toolsenabled":{"options":{"connection_file":"/absolute/private-sim-run/connection-amber.json"}}}}
```

Invoke `/toolsenabled-sim:toolsenabled-sim` with the delivery task. The skill reads status/observation, uses the current round, submits, and verifies delivery. Restrict the agent to the intended Sim tools where practical. The live coordinator cannot drive robots. Driver labels must name the actual client; a script is a scripted driver. A successful install or tool handshake is not a successful model-driven delivery.

## Human diagnostics and replay

Sim has **no dashboard or human-control link** to discover or reissue. Its hub prints private connection-file paths to the human's launch terminal. The human starts capture/replay explicitly with local CLI commands; these are unavailable to MCP agents. A replay server's printed capability URL is read-only and belongs in the human's private terminal, not an agent prompt.

Claude Code on the qualified Linux build records shim stderr under `~/.cache/claude-cli-nodejs/<cwd-slug>/mcp-logs-plugin-*/<timestamp>.jsonl`; select the `plugin:toolsenabled-sim:toolsenabled_sim` server. XDG cache settings can change the base. Stderr can appear as an `error` entry even for an upstream informational warning. The human can choose an absolute private `--debug-file` path. Agents with file/shell tools under the same OS account can read these logs; a mode-600 log is not protection from that agent. Do not ask the agent to search logs or connection files for another identity.

For connection recovery, stop the affected client normally, check its absolute file path and the owning hub, then restart that client. If the hub crashed, verify that it has stopped and deliberately move the stale run root aside before starting a new hub and reconfiguring the new private paths. Do not delete an active lease or let an agent seize another connection.

## Codex

The `.codex-plugin/plugin.json` uses an inline server with `args:["./src/mcp.mjs"]` and `cwd:"./"`, plus `env_vars:["SIM_CONNECTION"]` to forward the host’s connection path into the MCP subprocess. The tested Codex loader resolves that cwd to the installed plugin root. Set `SIM_CONNECTION` to the absolute private file in the host environment before launching Codex, or use the existing print-only `tools/mcp-config.mjs --client codex --connection /absolute/file` helper for direct registration. Codex does not consume Claude's `user_config`. The inline server uses the same name as the root Claude `.mcp.json` so it overrides that configuration. Root substitution strings are not supported in the tested legacy Codex MCP argv.

The stdio server reads one application environment variable at startup: `SIM_CONNECTION`. It is required, has no default, and missing or empty values fail before reading state. Claude and Desktop explicitly map their required `connection_file` option into this variable; Codex explicitly forwards it. There are no optional startup variables, interpreter selectors, or workspace defaults. The client needs its normal OS prerequisites (`HOME`, `PATH` and a writable temporary directory); `node` must be on `PATH`. Runtime state and robot identity come exclusively from the selected private connection file. Qualification under packaging revision 2.1 uses fresh client configuration and a scrubbed environment, verifies that the selected robot capability reached the intended hub, and proves startup fails when Codex's forwarding declaration is removed.

## Desktop bundle and release metadata

Provides a Claude Desktop bundle; native installation still needs qualification. The bundle requires Node 22+ and POSIX ownership support. Its manifest restricts native installation to macOS; Windows support needs a separate ownership implementation and qualification. Headless Linux MCP tests do not establish native Desktop acceptance, and including SKILL.md does not establish Desktop skill loading. Local MCP servers are not available in claude.ai chat.

The human imports only the reviewed bundle and supplies the absolute private connection-file path. During future native qualification, confirm shim stderr in `~/Library/Logs/Claude/mcp-server-<server-name>.log` and `mcp.log`. No one-time dashboard link is expected. A development signature proves neither trusted publisher identity nor native installation support.

Unsigned bundles are built twice with pinned mcpb 2.1.2, fixed build time and normalized modes. The development certificate is short-lived, CA:FALSE and codeSigning; its private key is destroyed outside source and handoff directories. Stock mcpb 2.1.2 verification has a known unimplemented PKCS#7 verification path; retain its failure and the independent OpenSSL CMS/tamper receipts. Production signing is an owner action.

Build from a clean committed checkout with the reviewed offline dependencies already present:

```sh
node tools/package.mjs /outside/toolsenabled-sim-0.1.2.zip
python3 tools/package-mcpb.py --mcpb-cli /absolute/pinned-mcpb-2.1.2/dist/cli/cli.js --output /outside/toolsenabled-sim-0.1.2.mcpb
python3 test/packaging-tools.test.py
```

Build again to different output paths and compare bytes. Both packagers require a clean committed checkout and share the source and per-dependency file allowlists. They validate installed names and versions against package-lock.json and every selected file against its reviewed SHA256; receipts report the versions actually packed. Vendored files are limited to traced runtime code, resolver metadata and legal notices; THIRD-PARTY.md lists every shipped dependency file. Transfer handoffs only through `tools/handoff.py copy SOURCE NEW_DESTINATION` after constructing SHA256SUMS, then use `verify` on receipt. The scanner checks unlisted files, archive members and reachable Git bundle blobs; caches, scratch state and signer directories stay outside every packet.

`server.json` is generated outside the product only after the coordinator publishes the qualified source and signed bytes. The release generator requires the handoff’s full `--expected-tree` ID, checks the pushed tag/commit and downloaded artifacts, and verifies every ZIP member against that tree and its dependency hash inventory. The ZIP must have one `sim/` wrapper and the matching plugin identity/version; the signed mcpb must contain exactly the same member bytes. No Registry sidecar, development digest or future public marketplace entry belongs in this source or the plugin archives.

For Registry generation, pass `--description 'Control warehouse robots offline with shared MCP tools, delivery guidance and exact replay.'`. This complete listing text is used verbatim. Descriptions outside 1–100 characters are refused; the generator never truncates public wording.

Directory review holds: five dependency files exceed 256 KiB and include minified JavaScript and embedded Rapier WebAssembly. The pruned package is below 512 files and contains no standalone WASM, fonts, images, reinstall scripts or third-party skills. The renderer uses Three.js and an externally provided Chromium runtime; no browser binary is bundled. These requirements are disclosed, not treated as directory approval. Source, exact dependency pins and licenses accompany the artifacts.
