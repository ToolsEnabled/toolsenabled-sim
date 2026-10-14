# ToolsEnabled Sim

Linux tested; native Windows not yet supported.

A shared warehouse for three or four wheeled robots. Each agent controls one robot through MCP; a coordinator assigns crates and advances the world in lockstep. Rapier runs the physics in Node by default; `--engine mujoco` runs the same warehouse on MuJoCo. Three.js replays the resulting log into first-person, chase, overhead and combined views, without a model or internet connection.

The included warehouse demo delivers three crates in ten seconds of simulation time, with no collisions. It launches four real stdio MCP clients: one coordinator and three scripted robot agents.

## Run the demo

Use Node.js 22 or newer. The release ZIP needs no install: it already includes its pinned npm dependencies. A Git checkout installs them first; `package-lock.json` pins the four packages by registry integrity, and `--offline --cache DIR` works only with a cache you filled from this lockfile beforehand:

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

For the release ZIP, download both files from [v0.1.11](https://github.com/ToolsEnabled/toolsenabled-sim/releases/tag/v0.1.11), then verify before extracting:

```sh
sha256sum -c toolsenabled-sim-0.1.11.zip.sha256
unzip toolsenabled-sim-0.1.11.zip
cd sim
```

Then run the demo on each engine and verify its recording:

```sh
node tools/demo.mjs --output ./runs/demo
node tools/replay.mjs ./runs/demo
node tools/demo.mjs --output ./runs/demo-mujoco --engine mujoco
node tools/replay.mjs ./runs/demo-mujoco
```

The pinned Rapier 0.17.3 compatibility loader prints `using deprecated parameters for the initialization function; pass a single object instead` on stderr once per process. It is an upstream initialization notice; successful output and recorded physics bytes are unaffected. MuJoCo does not print it.

The output directory must be new. No model, agent CLI, cloud service, browser or GPU is required for the simulation. `replay` verifies the complete hash chain, re-executes the action journal in fresh physics, and compares the trajectory bytes.

Two deterministic WebAssembly physics engines are pinned in `package-lock.json`: Rapier (`@dimforge/rapier3d-compat` 0.17.3, the default) and MuJoCo (`@mujoco/mujoco` 3.14.0, selected with `--engine mujoco`). The Rapier world has no gravity or friction. The MuJoCo world turns gravity, floor friction and bounded motor forces on: crates are free boxes that slide and stop under friction, a grabbed crate is welded 0.75 m in front of its robot, and go-to brakes early enough to stop on target. The engine is recorded in each run's trajectory header, and `replay` rebuilds the world on the recorded engine. The included demo delivers all three crates with no collisions on either engine.

## Connect agents

Start one hub for the shared world:

```sh
node src/hub-cli.mjs --root /absolute/private-sim-run
```

It prints paths to private connection files. Keep this process running. Add `--engine mujoco` to run the shared world on MuJoCo; the default is `rapier`. The engine is fixed for the life of the hub: reset and scenario changes rebuild the world on the same engine, and no tool argument can change it. Give each MCP host only the connection for its assigned robot; keep the coordinator connection with the coordinator. All connections attach to this same world. Generate a client configuration without modifying your settings:

```sh
node tools/mcp-config.mjs --client codex --connection /absolute/private-run/connection-amber.json
```

The connection path must be absolute and name an existing file created by the running hub. The helper checks the path without reading its private capability; ownership and connection contents are checked when the client starts.

Supported configuration formats: `claude`, `codex`, `cursor`, `claude-desktop`, `deepseek`. The helper emits TOML for Codex, `mcpServers` JSON for Claude Code/Cursor/Claude Desktop, and a Cordis profile-overlay YAML patch for DeepSeek Harness. DeepSeek output contains an `@deepseek-ai/dsh-mcp-client` entry under `- insert:` with the stdio command, arguments, environment and tool timeout. Merge that patch into your DSH profile overlay; it is not an `mcpServers` configuration. Configuration generation and stdio transport are tested; a real model/client session is a separate integration qualification. Claude Code and Codex plugin manifests and the `toolsenabled-sim` workflow skill are included. Claude uses its `connection_file` option; Codex uses an inline server and an absolute `SIM_CONNECTION` in the host environment. The helper avoids plugin-root interpolation when registering directly.

The coordinator calls `sim.step` after collecting commands from the robots. A slow agent changes wall-clock duration, never simulation timing. Reset and scenario selection are coordinator/human controls. They create a new run and preserve previous logs. Robot connections receive six tools in manual mode and seven in live mode. Full schemas and examples are in [docs/MCP.md](docs/MCP.md).

## Claude plugin

The `toolsenabled-sim` plugin connects to the shared hub using one agent’s private connection-file path. The repository is its own Claude Code and Codex marketplace. From a dedicated project for this robot:

```sh
claude plugin marketplace add ToolsEnabled/toolsenabled-sim
claude plugin install toolsenabled-sim@toolsenabled-sim -s local --config connection_file=/absolute/private-sim-run/connection-amber.json
codex plugin marketplace add ToolsEnabled/toolsenabled-sim
```

Claude Code stores `connection_file` per user (in `settings.json` of its configuration directory), not per project, so installing for a second robot rebinds the first. To run several robots on one OS account, give each robot agent its own `CLAUDE_CONFIG_DIR` and use it for every `claude` command of that agent; see [several robots on one OS account](docs/CLAUDE-INSTALL.md#several-robots-on-one-os-account). The install prints `1 userConfig option not yet set`: that is the optional `run_root`, and the message is expected.

For an offline Claude Code install from the verified ZIP, add its extracted `sim/` directory as a local marketplace and use the same plugin name. For a Git-backed install, Claude Code itself runs `npm ci --ignore-scripts` in the installed plugin directory; run `npm ci --ignore-scripts --no-audit --no-fund` there yourself only if its `node_modules` is missing. The release ZIP already includes the dependencies. Set Codex's absolute `SIM_CONNECTION` in the host environment before starting it, then install Sim from the toolsenabled-sim marketplace in Codex's /plugins browser.
See [docs/CLAUDE-INSTALL.md](docs/CLAUDE-INSTALL.md) for configuration, host diagnostics, recovery, Codex loading, offline prerequisites and release qualification. A Claude Desktop bundle can be built with `tools/package-mcpb.py`; no Desktop bundle is attached to the 0.1.11 release, and native installation still needs qualification. POSIX ownership checks are required; native Windows is not supported in this release.

Sim has no dashboard or human-control link. The human starts the hub and finds connection-file paths in its launch terminal. Capture and replay are explicit human-run local commands. Agent file/shell tools running as the same user can read host logs and private connection files; project scope and skill guidance do not provide OS isolation.

ToolsEnabled is not affiliated with or endorsed by Anthropic. [Privacy](https://toolsenabled.ai/privacy/) · [Support](mailto:support@toolsenabled.ai).

## Try it

No account or API key is needed: the hub and the plugin run on your computer, and Sim calls no model or online service of its own. Start a hub from the extracted release ZIP's `sim/` folder (or a checkout after `npm ci`) and leave it running; then, in another terminal and a new empty folder, install the plugin with the coordinator's connection file:

```sh
node src/hub-cli.mjs --root /absolute/private-sim-run
claude plugin marketplace add ToolsEnabled/toolsenabled-sim
claude plugin install toolsenabled-sim@toolsenabled-sim -s local --config connection_file=/absolute/private-sim-run/connection-coordinator.json
```

Start `claude` in that folder, approve each Sim tool call when asked, and try these three prompts:

1. `/sim status` opens the read-only Sim pane with `Bound role: coordinator / coordinator`; press `2` for its Result row: `Tick 0 · 0/3 delivered · 0 collisions · score 0`.
2. `Deliver amber's assigned crate to its zone, advancing the world with sim.step as you go.` Claude drives amber to `cargo-a` and grabs it (`robot.goto`, `robot.grab`), carries it to zone A's robot stop point (`robot.goto` to x 4.25, y -3.5: a held crate rides 0.75 m ahead of the robot, so the robot stops 0.75 m short of the zone center at x 5, y -3.5, as `deliveryAreas[].robotStops.east` in `sim.status` says; a goto to the center itself releases the crate at about x 5.72, outside the zone), releases it (`robot.release`) and advances the world with about ten `sim.step` calls of 60 ticks, then reports 1 of 3 crates delivered, 0 collisions, score 100.
3. `/toolsenabled-sim:step 60` passes the plugin's preflight, advances the world 60 ticks (one simulated second) and reports the new tick, 1 of 3 delivered and no contacts.

## What this plugin runs, sends and reads

This covers the Claude Code plugin in this repository: the hooks module `hooks/register.tsx` (a mod) with its helper `hooks/view.mjs`, the MCP server entry in `.mcp.json`, the eight action commands in `commands/` and the skill. The hub, the demo, the live launcher, capture and replay are separate commands you run yourself; the plugin never starts them.

**Events the mod hooks**

- `session.start`: lists the slash commands and, unless another command is already named `sim`, registers `/sim`. It reads no file, starts no program and passes the event on unchanged.
- `session.end`, and `ui.close` for the Sim pane: clear the pane's in-memory state and pass the event on unchanged.
- `command.run` for `/sim`, the command it registers: opens the read-only Sim pane and starts the reader described below. The command prints only fixed text, such as "Sim pane opened." or the usage line; what the pane shows is drawn on your screen and never becomes a message to the model. If Claude Code or another plugin already owns `/sim`, the hook passes the event on unchanged and does nothing else.
- `command.run` for the plugin's own eight action commands: `/toolsenabled-sim:deliver`, `:move`, `:hold`, `:submit`, `:step`, `:assign`, `:scenario` and `:reset`. (`command.run` is also the name of a call; the mod never makes that call.) The hook checks the action before any model turn. Then it either passes the event on unchanged (`return next(e)`), so the command runs exactly as you typed it, or answers the command itself, and the command does not run:
  - arguments that do not fit the command's form get the usage line;
  - an action that did not come from you gets "Type the Sim action yourself to request it." Only your own prompt, at this terminal or through Remote Control, can start an action. A message from another Claude session, a channel, a schedule, a task notification, an SDK host or another plugin cannot, so no other agent or program can make this session act with its connection;
  - an action the read-only preflight refuses opens a notice in the Sim pane instead of a model turn: for example, the hub is not running, this connection's role or mode does not allow the action, the run has stopped, the coordinates fall outside the arena, or the scenario file fails its checks.

  If the hook itself fails, it refuses rather than let the command run unchecked. The mod never changes a permission, a tool approval, the permission mode, a setting, Remote Control, an agent or a file. The action commands grant no tools (they have no `allowed-tools`), so every Sim tool call they lead to goes through Claude Code's normal approval, and `disable-model-invocation: true` keeps Claude from running them by itself. The model learns this connection's role, agent and robot from `sim.status`, which reports them as `whoami`.
- `ui.render` for the Sim pane: draws the pane from data already read.

**Programs it starts**

The mod starts one program, the plugin's own reader, to read the view a pane shows or to check an action before the model turn (the preflight). It starts it through Claude Code's process call, with a 5-second limit and the plugin folder as its working directory:

```text
/usr/bin/env -i PATH=<your PATH> LANG=C.UTF-8 SIM_CONNECTION=<connection_file> SIM_RUN_ROOT=<run_root> node <plugin folder>/tools/sim-view.mjs <view> --json [options]
```

`<view>` is the pane being opened (`status`, `robots`, `map`, `runs`, `events`, `scenarios`, `replay` or `connection`; `help` starts nothing), or `action` for an action's preflight, which receives `{"verb": ..., "args": [...]}` on standard input. The options are the ones that pane needs: `--stream`, `--run`, `--check <file>`, `--offset`, `--cursor` and `--revision`. `env -i` starts it with only those four variables, so your API keys, tokens and Node settings such as `NODE_OPTIONS` never reach it. `node` is found on your `PATH`, or on `/usr/local/bin:/usr/bin:/bin` when `PATH` is empty. It runs when you open a pane, page, reload or switch views, or type an action command; never at startup and never on a timer. It is the same reader the Codex commands run (`tools/sim-view.mjs`); running it as its own process keeps your environment out of it.

The MCP server entry runs `node <plugin folder>/src/mcp.mjs` with `SIM_CONNECTION` set to your `connection_file`; Claude Code starts and stops it. Neither the mod nor the server starts a hub, a browser or a shell. Every tool the server lists declares a plain-language `title` (as the tool's top-level `title` and as `annotations.title`) and the hints `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`: `sim.observe`, `sim.status` and `sim.assignments` are read-only, every other tool changes the shared world and is marked destructive and not idempotent, and no tool reaches beyond your computer.

**What it reads**

- The connection file you set as `connection_file`. The reader and the MCP server open it only when its folder is owned by you and not writable by group or others, and the file is a regular file (not a symbolic link; a FIFO or other special file is refused at once) owned by you with mode 0600, at most 4 KiB. It holds the local hub's address, a random 256-bit capability for this one connection, and the role, agent and robot that the capability is bound to.
- Run history, in the run root you set as `run_root` or in the connection file's own folder when that is a private run root (owned by you, mode 0700): the run folders, `current-run.json` and the runs' `trajectory.jsonl`, `actions.jsonl` and `live.jsonl`, at most 512 KiB per read. While the hub is running it supplies the views, so the reader only locates the run root (through `current-run.json`), lists the run folders and reads the selected run's last recorded tick for `/sim replay`.
- A scenario file you name in `/sim scenarios <file>` or `/toolsenabled-sim:scenario <file>`: an absolute path to a regular file owned by you, not a symbolic link or FIFO, not writable by group or others, at most 256 KiB. After the scenario preflight accepts it, the model reads that same file with Claude Code's Read tool, under its normal approval.
- The mod itself reads one environment variable, `PATH`, to hand it to the reader.

**What it sends, and where**

- The reader and the MCP server connect only to the hub at the `http://127.0.0.1:<port>/` address in the connection file, and refuse any other address. Each request carries the capability as a bearer token. The reader asks the hub for a view (`GET /view`); the MCP server forwards Claude's Sim tool calls (`POST /call`).
- Nothing is sent to ToolsEnabled or to any other server. There is no telemetry, update check or download.
- What Claude reads goes to the model provider your Claude Code uses, as part of your conversation: Sim tool results, and an action command's prompt with the arguments you typed. Pane contents do not.

**The connection file is the credential**

The directory reports that Sim uses a credential from your machine: that is the connection file above. Your own hub creates it with mode 0600 in its private run root when it starts, and removes it on clean shutdown. Its capability works only against that hub on 127.0.0.1 and selects one fixed role, agent and robot; it is not an account, cloud or API credential. The plugin passes the file's path, never its contents, through `SIM_CONNECTION`. The capability never appears in arguments, settings, prompts, tool results or the pane.

**Where it runs, and its dependencies**

The MCP server is a local stdio server that needs `connection_file`. Claude Code loads it and asks you for that value; claude.ai chat ignores local servers, and Cowork ignores a server whose option has no default, which `connection_file` does not have. `package-lock.json` pins four npm packages by registry integrity: `@dimforge/rapier3d-compat` 0.17.3, `@mujoco/mujoco` 3.14.0, `playwright-core` 1.62.0 and `three` 0.180.0. A Git install installs them with `npm ci --ignore-scripts`; the release ZIP already contains them.

## Commands

Open `/sim help` for local status, robots, map, runs, events, scenarios, replay guidance and connection panes. Request actions with the native names `/toolsenabled-sim:deliver`, `:move`, `:hold`, `:submit`, `:step`, `:assign`, `:scenario` and `:reset`; help prints their full spellings and role gates. Actions keep normal tool approvals and are checked against this connection's role and mode before the model turn; they then run as typed, and the model reads its bound robot from `sim.status`. Codex uses `!node /absolute/sim/tools/sim-view.mjs <view>` and `$toolsenabled-sim:toolsenabled-sim <action>`. See the complete [command table](docs/COMMANDS.md), including optional `run_root` / `SIM_RUN_ROOT` for archived history.

## Live mode

Run `node tools/live.mjs --root /absolute/private-live-run --work-record /absolute/work-record.json` to print per-agent Claude Code and Codex registration and start the shared live clock. `--engine mujoco` runs the live world on MuJoCo. Every assignment in the work record must carry a `driverLabel`, the actual driver's name such as `CLAUDE CODE` or `CODEX` (see the example in [docs/LIVE.md](docs/LIVE.md)); the demo's `runs/demo/work-record.json` has none, so add one to each of its three assignments before passing it to the launcher, or the launcher refuses it. Every active robot finishes a round with `robot.submit`; the launcher steps when all have submitted or a **120-second wall-clock budget** expires. Missing robots hold. Round tokens reject late commands. Physics and frame replay remain deterministic. See [docs/LIVE.md](docs/LIVE.md) for registration, the agent loop, options and replay behavior.

## Render offline

Set `SIM_CHROMIUM_EXECUTABLE` to the real browser binary with its runtime libraries, for example `/opt/google/chrome/chrome` or a `chrome-headless-shell` binary, not a wrapper script such as `/usr/bin/google-chrome`: the capture receipt records the browser's SHA-256 as part of frame identity, so capture follows a link to the file it names and refuses a script with `SIM_CHROMIUM_EXECUTABLE names a script, <path>, not the browser binary`. If unset, capture and the render tests use `playwright-core`'s cached Chromium path (`chromium.executablePath()`), which must already exist locally. This package never downloads a browser or installs system packages. Physics does not depend on Chromium.

```sh
export SIM_CHROMIUM_EXECUTABLE=/path/to/chrome-headless-shell
node tools/capture.mjs --run ./runs/demo --output ./runs/frames --seconds 10 --cameras all
node tools/capture.mjs --run ./runs/demo --output ./runs/verified --seconds 10 --cameras all --verify-against ./runs/frames
```

Each view is a 1080×1080 RGB PNG sequence at 30 simulation frames per second. `all` includes the combined layout, every robot's FPV and chase, `overview`, and `overview_top`. Ten seconds produces 300 frames per view. The second command starts a fresh browser, renders every frame again and verifies each SHA-256, retaining only its verification receipt. Use `--cameras multiview` for just the composed view. Every view displays **SIMULATION**. For an external capture pipeline, `node src/replay-server.mjs --run ./runs/demo` keeps the read-only replay page available and prints its local URL.

Capture uses an isolated headless browser and a temporary allowlisted loopback asset server. It is a local replay command; screen capture, uploads and publishing are not available as MCP tools. Camera conventions, the deterministic `renderAt(t, camera)` page hook, file formats and reproducibility limits are in [docs/REPLAY.md](docs/REPLAY.md).

## Scenarios and Fleet

Pass `--scenario /absolute/scene.json --work-record /absolute/work-record.json` to the hub. Scenarios declare arena dimensions, robot poses/colors, crates, obstacles and destination zones. No scene-specific code is needed. See [scenarios/warehouse.json](scenarios/warehouse.json) and [docs/SCENARIOS.md](docs/SCENARIOS.md). The coordinator can assign subsequent crates with `sim.assign`; the robot-to-agent mapping stays stable for the life of the hub.

A Fleet work record export contains `assignments`, with `robotId`, `agentId`, `crateId`, `taskId` and `ledgerId` for every robot, plus `driverLabel` for live runs. These IDs appear in every state record and accepted command. Start each robot's host only after it has claimed its Fleet assignment. To verify real Fleet storage locally without model calls:

```sh
node tools/prove-fleet.mjs --fleet-root /path/to/fleet-source --output ./runs/fleet-proof
```

This optional integration command creates an isolated Fleet SQLite database and T ledger, submits/claims/starts one task per scripted robot, completes the warehouse through MCP, and marks the three tasks and ledger entries complete. It records source hashes, exports the work record, and uses actor `local` for both filing and completion. Scripted driver labels and `modelsInvoked: 0` are explicit. Fleet source is not bundled into Sim. The ordinary demo uses explicitly named `script-*` work IDs; those are local demonstration records, not Fleet receipts.

## Tests and limits

```sh
env -u DISPLAY -u WAYLAND_DISPLAY -u DBUS_SESSION_BUS_ADDRESS npm test
```

The full suite includes actual headless Chromium rendering and fails clearly if its offline runtime is missing. Set the browser environment above first. For physics/MCP-only diagnosis, run `node --test --test-concurrency=1 test/core.test.mjs test/mcp.test.mjs test/physics-safety.test.mjs test/security.test.mjs`; this is a subset, not the full verification gate.

The world is a planar rigid-body approximation: velocity-controlled wheeled robots, rigid grasping (a fixed joint in Rapier, a weld in MuJoCo), no wheel slip, ramps, cameras-as-sensors or learning. Rapier runs without gravity or friction; MuJoCo adds gravity, floor friction and bounded motor forces, and still drives robots in the plane. Path following is a bounded grid planner with line-of-sight simplification; it accounts for obstacles and current robot/crate positions, and does not predict other robots' future paths. A coordinator must schedule crossing traffic. Contacts are counted and penalized; path planning does not promise collision-free motion for arbitrary concurrent commands. New commands replace the current motion at a tick boundary. Seed and scene are recorded; this version has no stochastic noise.

Physics replay is byte-identical with the recorded engine's pinned package and the same action log on the tested Node/platform. Frame identity requires the same Chromium binary, SwiftShader runtime, platform and renderer; no cross-GPU or cross-browser guarantee is made. Render receipts record the browser version, executable SHA-256 and flags. The local tools do not isolate hostile processes running as the same operating-system user; see [SECURITY.md](SECURITY.md).

Release validation also runs `python3 test/deepseek-config.test.py` with the offline PyYAML 6.x test dependency. It parses the emitted DeepSeek YAML and verifies the Cordis overlay structure and exact connection arguments. PyYAML is only a test prerequisite; the plugin has no Python runtime dependency.

The optional Fleet release regression is `SIM_FLEET_ROOT=/path/to/fleet-source node --test test/fleet-proof.integration.mjs`; it runs a real isolated proof and checks every ledger event and completed record for actor `local`.

No provider credentials or model calls are needed.

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
