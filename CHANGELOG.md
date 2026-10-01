# Changelog

## 0.1.0 — 2026-10-01

Initial public release candidate. Earlier handoffs were unpublished internal builds.

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
