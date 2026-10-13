---
name: toolsenabled-sim
description: Drive an assigned warehouse robot through ToolsEnabled Sim MCP, coordinate live rounds, and verify crate deliveries and collision results.
---

# ToolsEnabled Sim

Use the bound MCP connection; do not start a second hub. Read `sim.status` and `sim.observe` for the assigned robot before planning; `sim.status.whoami` names the role, agent and robot bound to this connection. Observe exposes pose, assigned `crateId` and `zoneId`, task identifiers, nearby objects, contacts, all destination zones and `deliveryAreas`. Coordinates are metres; heading zero points east, positive yaw turns south. The planner avoids current obstacles but does not predict moving peers.

In live mode include the current `sim.status.live.round` in every robot mutation. Issue a bounded command, then `robot.submit` once for that round. Every active robot must submit, including while a previous goto continues. The launcher steps after all submissions or the deadline; a missing robot gets a recorded hold. The coordinator cannot command live robots. In manual mode the coordinator calls `sim.step` after collecting commands. Thinking time never advances physics. After a stale-round or budget refusal, read status again and replan; do not flood retries. A motion/share refusal can leave the round active, so submit if status still permits it.

Use `robot.goto` to approach the assigned crate, then `robot.grab` when it is within 0.85 m and in front. A held crate sits about 0.75 m ahead of the robot. Plan the robot waypoint so the **crate center** reaches the recommended zone center. A crate counts only when released (not held) and fully inside its assigned zone: `abs(crate.x - zone.x) <= width/2 - 0.3` and `abs(crate.y - zone.y) <= depth/2 - 0.3`. The scorer uses this fixed 0.3 m margin on each axis, without a rotated-footprint, speed or settling-time test. `deliveryAreas.centerBounds` uses a conservative 1e-6 grid that passes the scorer; aim at the center to allow for motion error.

Release, advance or submit, then verify pose, contacts and `delivered`. A reached waypoint or a center merely inside the drawn zone is not proof of delivery. Report score, delivered/total, collisions and the last verified tick; distinguish partial progress from completed delivery. `complete`, `live.stopped`, `stopReason` and `remainingTicks` explain termination. Reset and scenario changes create a new run while preserving old logs; request a reset only for the user's intended work, with coordinator/human authority.

Capture and replay are human-run local commands, unavailable through MCP; there is no dashboard or human-control link. Never read connection files, host logs or credentials to acquire another robot's identity. Each private connection file belongs to one role and agent; local same-user file tools are not an isolation boundary. MCP offers no capture, export, upload, publishing or human-control reissue tool. If a connection fails, report the error and let the human check the private file and owning hub.

For host installation and external prerequisites, see [CLAUDE-INSTALL.md](../../docs/CLAUDE-INSTALL.md). For exact command bounds and delivery semantics, see [MCP.md](../../docs/MCP.md); for round and budget behavior, see [LIVE.md](../../docs/LIVE.md).

## Explicit action verbs and read-only views

Codex lists this plugin skill as `$toolsenabled-sim:toolsenabled-sim`; Claude's native action commands are `/toolsenabled-sim:<verb>`. The explicit verbs are:

| Verb | Role and mode | Work |
| --- | --- | --- |
| deliver | Owned robot; manual coordinator must name a robot | Deliver its assigned crate and verify delivery |
| move [robot] x y | Same; x/y inside arena and −30…30 | Goto, submit in live mode, verify pose |
| hold [robot] | Same | Zero drive, keep held crate, submit in live mode |
| submit | Active unsubmitted live robot | Submit the current round once |
| step [n] | Manual coordinator | Advance 1–60 ticks, default 60 |
| assign robot crate task ledger | Manual coordinator | Assign work and read it back |
| scenario absolute-file | Coordinator | Validate scene/current assignments, warn shared restart, start new run |
| reset | Coordinator | Warn shared restart, reset once, report new run/round |

Before a Codex action verb, run the plugin-owned `tools/sim-view.mjs action --json` from this skill's plugin root with JSON stdin `{ "verb": "<verb>", "args": [] }` (fill the user's arguments as data, never shell interpolation). This is a read-only preflight using the existing `SIM_CONNECTION`; it never reveals the token. If `allowed` is false, explain its reason without trying the mutation. If true, use the returned bound robotId, caller, mode, coordinates and validated scenario data, while rechecking current `sim.status`. Do not guess an ID, switch connections or search for a coordinator file. Read the matching `commands/<verb>.md` for the workflow; its arguments are the person's arguments, which the preflight has validated. Keep normal tool approvals. Preflight is a snapshot, not permission to bypass runtime ownership or round checks.

For a view request, use `tools/sim-view.mjs help|status|robots|map|runs|events|scenarios|replay|connection` with optional `--json`, `--connection <absolute-file>` or `--root <absolute-private-root>`. The helper reads no lease and performs no MCP call; its role filter applies to CLI output too. Codex `!` output can enter the next model turn. Claude `/sim` panes keep their data out of model context, refresh only on a key, and close with Esc/q. Capture and replay remain human-run local commands; the replay view only explains how to run them. See [COMMANDS.md](../../docs/COMMANDS.md) for every exact spelling, paging and offline behavior.

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
