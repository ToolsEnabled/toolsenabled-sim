# Changelog

## 0.1.5 — 2026-10-13

- Ship Claude Code and Codex marketplace catalogs in this repository and the release ZIP, with public and verified local install commands.
- Clarify that no Claude Desktop bundle is attached; it can be built separately and still needs native installation qualification.
- Require an absolute existing connection file when generating MCP configurations; preserve the path without reading its capability.
- Explain empty events pages for an unbound offline observer without exposing private actions.
- Print one-line capture and artifact-verifier usage/errors, refuse missing capture option values, and remove only capture output freshly created by a failed attempt.
- Document the existing Playwright-cache Chromium fallback, the Rapier compatibility loader's upstream notice beside the quick start, and PyYAML 6.x as a test prerequisite.
- Preserve the pinned runtime dependencies and recorded physics bytes on both engines.

## 0.1.4 — 2026-10-12

0.1.3 was an internal handoff and was never published; every change listed under it ships for the first time in this release.

- Add MuJoCo as an optional physics engine. `--engine mujoco` on the hub CLI, the demo and the live launcher runs the same warehouse on the official MuJoCo WebAssembly build, pinned as `@mujoco/mujoco` 3.14.0: gravity, floor friction and bounded motor forces are on, crates are free boxes that slide and stop under friction, a grabbed crate is welded 0.75 m in front of its robot, and go-to brakes early enough to stop on target. The scripted demo delivers 3/3 crates with no collisions on either engine and replays byte-identically.
- Keep Rapier the default. It now sits behind the same engine interface and is called in exactly the order the earlier code used, so every existing recording replays byte-identically; the demo trajectory bytes are unchanged since 0.1.2.
- Record the engine in every trajectory header and show it in the demo receipt and `/sim runs`. Replay rebuilds the world on the recorded engine. Version-2 headers accept either engine; version-1 headers must name Rapier. Reset and scenario changes keep the hub's engine; no tool argument can change it.
- Carry the two handoff-3 fixes listed under 0.1.3: pane readers and action preflights start with an explicit environment allowlist that excludes client credentials (P-ENV), and every reserved pane key is handled in every pane state (P-KEYS).
- Make the private current-run pointer write best-effort: a failed sidecar write is reported once per error code on stderr (startHub `onWarning`, `hub.pointerError`), never fails the command that triggered it and never stops a live hub; the next successful write replaces the stale pointer.
- Refuse `--engine` with no value on the hub CLI and the demo instead of silently running Rapier, check the demo's engine before it creates the output directory, refuse a version-1 recording on MuJoCo and an unknown engine id in `replayActions`, keep MuJoCo joint, actuator and weld names distinct for every valid scene id, print one-line errors from the demo, replay and configuration helpers, and declare the MIT license in package.json.
- Document `--engine` and the install line in the README, design, MCP, live, replay and installation documents.

## 0.1.3 — 2026-10-02

- Start pane readers and action preflights with an explicit environment allowlist, excluding client credentials before Node starts.
- Keep every reserved pane key handled in loading, error, detail and boundary states, with no-op hints and an active-only Keys line. Closing during a read discards the late result.
- Add `/sim` read-only panes for status, help, robots, map, runs, events, scenarios, replay guidance and connection diagnostics. Use a separate capability-authenticated view quota, without expiring rounds or entering the mutation queue. Bound and sanitize reads; keep peer work mappings private and pin paged history revisions.
- Add eight native Claude action commands with before-turn role/mode checks and explicit bound robot IDs. Keep normal tool approvals; provide the matching namespaced Codex skill verbs and read-only CLI.
- Retain an owner-only current-run pointer and live deadline metadata outside deterministic recordings. Support optional absolute `run_root` / `SIM_RUN_ROOT` for offline history; unknown offline identities see public poses and shared launcher commits only.
- Refuse a hidden LZMA stream even when its header claims both an oversized dictionary and expanded size. Preserve ordinary Python bytecode acceptance and fail closed on corrupt or memory-limited compressed inputs.
- Preserve physics, renderer and replay journal bytes. Real terminal/client qualification is recorded separately from local hook and reader tests.

## 0.1.2 — 2026-10-01

- Refuse an agent's drive/goto with `MOTION_BYTE_BUDGET` when only its future motion reservation exceeds remaining run space. Leave the run active so peers and the live barrier can continue. A failed control/frame reservation still stops the run cleanly with `RUN_BYTE_BUDGET`.
- Expose the exact delivery rule and per-zone crate-center bounds through observe/status, tool descriptions and connection instructions. Explain release, carrying offset and verification; preserve recorded snapshots and physics.

- Add Claude Code/Desktop manifests and the `toolsenabled-sim` workflow skill, absolute connection-path validation, and Codex inline MCP configuration. Runtime dependencies remain vendored and offline; native Desktop and production signing require separate qualification.

- Correct earlier budget/verifier wording. Published 0.1.1 is `3f4785347bf01d9114149c250997bfbd37710dff` on 0.1.0 `d9b06e5db416fbf2ca13ee06ddfa92493bb6e321`.
- Include assigned crate/zone IDs and conservative, scorer-checked delivery bounds in agent guidance without changing recording bytes.
- Prune offline dependencies to traced runtime files and required metadata/notices. Verify dependency hashes and clean source, bind release archives to the reviewed tree, inspect hidden compressed handoff content, and require absolute launcher input paths.

## 0.1.1 — 2026-10-01

- Give each robot an independent recording share. Refuse a call that exceeds that share without stopping peers; keep live submissions and deadline holds available while run-wide space remains.
- Report whole-run exhaustion as `RUN_BYTE_BUDGET`, journal a clean stop immediately and cancel the live deadline. Submit and release no longer add the current motion’s lifetime to the run-wide admission check; grab already had no motion term. Ongoing motion is not held aside as a persistent run-wide reservation.
- Reserve the planned motion's serialized size and bounded lifetime, releasing unused storage when it finishes or is replaced. Remove the flat new-run `goto` reservation.
- Cover manual and live one-tick floods, reset, small recording caps and historical 0.1.0 budget-stop replay. Document step-size overhead in LIVE.md.
- Preserve existing recording bytes through an explicit budget-policy header. The 0.1.0 tag and release artifacts remain unchanged.
- Recordings with the new `budgetPolicy` header require Sim 0.1.1 or later for verified replay; the 0.1.0 verifier cannot verify them and fails closed, with either a physics-mismatch or recording-budget error.
- Document a practical ceiling of about 30,000 ticks for one-tick live runs at the default recording cap; larger scenes or heavier traffic can stop sooner.

## 0.1.0 — 2026-10-01

Initial public release. Earlier handoffs were unpublished internal builds.

- Shared, fixed-step warehouse simulation with three or four independently controlled robots and bounded motion, grasping and task assignment.
- Manual coordination and live submission barriers with a 120-second default, robot-owned commands, explicit timeout holds and stale-round rejection.
- Append-only caller-attributed journals, bounded recording size and byte-identical physics replay, including historical version-1 free-text recordings.
- Offline 1080-square RGB capture with higher downward-pitched FPV cameras, tightly fitted overviews, upright zone labels, deterministic shadows and a floor grid.
- Captions based on the actual command caller and Studio metadata based on the glyphs drawn.
- Private run/connection ownership, protected replay assets, fair capability quotas, short socket timeouts and startup-safe signal cleanup.
- Mode-aware tool schemas, per-robot mutation budgets including submissions, shared robot ordering, bounded planner work and actionable large-scene limits.
- Bounded stdio EOF, specific protocol errors and directly copyable per-agent Claude Code/Codex registration commands.
- Configuration helpers for five MCP clients, including DeepSeek Harness Cordis YAML overlays, and a Codex plugin manifest.
- Scripted warehouse demo and isolated Fleet task/ledger integration proof attributed to the local actor.
