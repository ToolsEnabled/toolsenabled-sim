# Changelog

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
