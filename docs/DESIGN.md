# ToolsEnabled Sim design

## Dependencies

The Node.js runtime is 22 or newer. These are the complete direct and transitive npm dependencies; all three are bundled into the offline distribution at exact versions:

| Package | Version | Purpose |
| --- | --- | --- |
| `@dimforge/rapier3d-compat` | `0.17.3` | Bundled deterministic WASM rigid-body physics |
| `three` | `0.180.0` | Offline WebGL scene and cameras |
| `playwright-core` | `1.62.0` | Headless Chromium adapter; no browser download |

Install from the supplied npm cache and lockfile with `npm ci --offline --ignore-scripts --no-audit --no-fund`. There are no native addons, hosted assets, model providers or system-package installers. Node built-ins provide stdio JSON-RPC, loopback HTTP, validation, tests, hashing and reproducible packaging. Chromium and its portable runtime libraries are explicitly supplied by the operator for rendering, never for physics. Capture receipts pin their environment. No cross-GPU or cross-browser frame identity is promised.

## Shared simulation

One Node hub owns one Rapier world and a fixed 1/60-second clock. Three or four independent stdio MCP connections share it. Each connection capability binds a role, agent and robot. The coordinator accepts work through Fleet, binds each task/ledger pair to a robot, collects commands, and commits steps. Only stepping advances simulation time. In optional live mode the launcher commits when every active robot submits, or after a default 120-second wall-clock budget. Explicit holds and steps are journaled; replay reads no clock. Round tokens bind accepted robot commands to the run and tick. See LIVE.md. Robot iteration, action ordering, canonical serialization and rounded observations are deterministic.

The world is planar. Robots are differential-drive cylinders; crates are dynamic cubes. Velocity controls are bounded; goto uses a bounded grid path and line-of-sight simplification. Carried crates use physical fixed joints with parent contacts disabled. Path planning inflates the carried footprint; Rapier produces contacts when commands meet obstacles. Score is 100 per delivered crate minus 10 per contact beginning. Agents must coordinate crossing traffic rather than assume the static planner predicts it.

Scenario JSON describes the arena, initial robot/crate poses, racks and labeled zones. Work records bind robot and agent IDs to crate, Fleet task and ledger IDs. Subsequent coordinator assignments preserve the agent→robot mapping. Scenario/reset operations create a fresh run and preserve old logs. Client identity is selected by the launcher, never by tool arguments. Bounds apply to frames, concurrent requests, per-robot commands and total ticks.

## Recording and replay

Each run begins with an immutable scene/seed/work-record header. The trajectory records tick zero and every subsequent step, including poses, active commands, per-tick accepted events, driving agents, task/ledger IDs, contacts and score. A canonical JSON SHA-256 chain links the records. An independent action journal preserves accepted order and unstepped commands. Physics replay reconstructs the world and compares full trajectory bytes.

Rendering is independent of physics. The browser reads a verified trajectory and samples it at time t. `renderAt(t, camera)` uses interpolated poses and fixed camera geometry, with no clock or random source. It returns a promise for Studio compatibility. The page declares readiness and raster text metadata. Every frame carries SIMULATION; embedded glyphs avoid font dependencies. Camera intrinsics/extrinsics are documented in REPLAY.md.

The reference capture script launches a private headless Chromium instance, blocks external page requests and records square 1080×1080 RGB PNGs at 30 simulation fps. It supports FPV and chase for every robot, perspective and top-down overview, and a combined layout. Verification launches a fresh browser and compares every raw PNG hash. A separate GET-only replay server allows an external capture pipeline to use the same page hook.

## Verification and packaging

Tests cover independent deterministic worlds, full physics replay, strict input/identity checks, collisions and physical grasping, command/tick budgets, data-driven four-robot scenes, assignment provenance, complete stdio warehouse lifecycle, immutable old runs, golden tool schemas, protocol framing, request bursts, role/catalog exclusions, real headless rendering and Studio's hook contract. The full suite requires the supplied browser and runs with DISPLAY unset.

The scripted demo uses no model and drives all robots through MCP. An optional integration proof uses a local Fleet checkout with an isolated SQLite database and T ledger. No live user state is needed. Product source, bundled dependency closure, sample evidence and exact test receipts are independently auditable. Distribution archives have fixed ordering, timestamps and permissions; two builds must be byte-identical. The source bundle preserves the regression history.
