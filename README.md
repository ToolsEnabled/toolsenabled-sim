# ToolsEnabled Sim

A shared warehouse for three or four wheeled robots. Each agent controls one robot through MCP; a coordinator assigns crates and advances the world in lockstep. Rapier runs the physics in Node. Three.js replays the resulting log into first-person, chase, overhead and combined views, without a model or internet connection.

The included warehouse demo delivers three crates in ten seconds of simulation time, with no collisions. It launches four real stdio MCP clients: one coordinator and three scripted robot agents.

## Run the demo

Use Node.js 22 or newer. The offline distribution already includes its pinned npm dependencies. From a source checkout, use the supplied npm cache:

```sh
npm ci --offline --cache /path/to/npm-cache --ignore-scripts --no-audit --no-fund
node tools/demo.mjs --output ./runs/demo
node tools/replay.mjs ./runs/demo
```

The output directory must be new. No model, agent CLI, cloud service, browser or GPU is required for the simulation. `replay` verifies the complete hash chain, re-executes the action journal in fresh physics, and compares the trajectory bytes.

## Connect agents

Start one hub for the shared world:

```sh
node src/hub-cli.mjs --root /absolute/private-sim-run
```

It prints paths to private connection files. Keep this process running. Give each MCP host only the connection for its assigned robot; keep the coordinator connection with the coordinator. All connections attach to this same world. Generate a client configuration without modifying your settings:

```sh
node tools/mcp-config.mjs --client codex --connection ./runs/shared/connection-amber.json
```

Supported configuration formats: `claude`, `codex`, `cursor`, `claude-desktop`, `deepseek`. The helper emits TOML for Codex, `mcpServers` JSON for Claude Code/Cursor/Claude Desktop, and a Cordis profile-overlay YAML patch for DeepSeek Harness. DeepSeek output contains an `@deepseek-ai/dsh-mcp-client` entry under `- insert:` with the stdio command, arguments, environment and tool timeout. Merge that patch into your DSH profile overlay; it is not an `mcpServers` configuration. Configuration generation and stdio transport are tested; a real model/client session is a separate integration qualification. Claude Code and Codex plugin manifests and the `toolsenabled-sim` workflow skill are included. Claude uses its `connection_file` option; Codex uses an inline server and an absolute `SIM_CONNECTION` in the host environment. The helper avoids plugin-root interpolation when registering directly.

The coordinator calls `sim.step` after collecting commands from the robots. A slow agent changes wall-clock duration, never simulation timing. Reset and scenario selection are coordinator/human controls. They create a new run and preserve previous logs. Robot connections receive six tools in manual mode and seven in live mode. Full schemas and examples are in [docs/MCP.md](docs/MCP.md).

## Claude plugin

The `toolsenabled-sim` plugin connects to the shared hub using one agent’s private connection-file path. Install it at local project scope from a verified marketplace snapshot. See [docs/CLAUDE-INSTALL.md](docs/CLAUDE-INSTALL.md) for configuration, host diagnostics, recovery, Codex loading, offline prerequisites and release qualification. Provides a Claude Desktop bundle; native installation still needs qualification. POSIX ownership checks are required; native Windows is not supported in this release.

Sim has no dashboard or human-control link. The human starts the hub and finds connection-file paths in its launch terminal. Capture and replay are explicit human-run local commands. Agent file/shell tools running as the same user can read host logs and private connection files; project scope and skill guidance do not provide OS isolation.

ToolsEnabled is not affiliated with or endorsed by Anthropic. [Privacy](https://toolsenabled.ai/legal/privacy/) · [Support](mailto:support@toolsenabled.ai).

## Live mode

Run `node tools/live.mjs --root /absolute/private-live-run --work-record /absolute/work-record.json` to print per-agent Claude Code and Codex registration and start the shared live clock. The work record includes the real `driverLabel` for each agent. Every active robot finishes a round with `robot.submit`; the launcher steps when all have submitted or a **120-second wall-clock budget** expires. Missing robots hold. Round tokens reject late commands. Physics and frame replay remain deterministic. See [docs/LIVE.md](docs/LIVE.md) for registration, the agent loop, options and replay behavior.

## Render offline

Provide a portable Chromium binary and its runtime libraries. This package never downloads a browser or installs system packages. Physics does not depend on Chromium.

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

The world is a planar rigid-body approximation: velocity-controlled wheeled robots, fixed-joint grasping, no wheel slip, ramps, gravity, cameras-as-sensors or learning. Path following is a bounded grid planner with line-of-sight simplification; it accounts for obstacles and current robot/crate positions, and does not predict other robots' future paths. A coordinator must schedule crossing traffic. Contacts are counted and penalized; path planning does not promise collision-free motion for arbitrary concurrent commands. New commands replace the current motion at a tick boundary. Seed and scene are recorded; this version has no stochastic noise.

Physics replay is byte-identical with the pinned engine and same action log on the tested Node/platform. Frame identity requires the same Chromium binary, SwiftShader runtime, platform and renderer; no cross-GPU or cross-browser guarantee is made. Render receipts record the browser version, executable SHA-256 and flags. The local tools do not isolate hostile processes running as the same operating-system user; see [SECURITY.md](SECURITY.md).

Release validation also runs `python3 test/deepseek-config.test.py` with the offline PyYAML 6.0.3 test dependency. It parses the emitted DeepSeek YAML and verifies the Cordis overlay structure and exact connection arguments. PyYAML is only a test prerequisite; the plugin has no Python runtime dependency.

The optional Fleet release regression is `SIM_FLEET_ROOT=/path/to/fleet-source node --test test/fleet-proof.integration.mjs`; it runs a real isolated proof and checks every ledger event and completed record for actor `local`.

No provider credentials or model calls are needed.
