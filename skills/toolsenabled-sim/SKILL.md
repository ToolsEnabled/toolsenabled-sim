---
name: toolsenabled-sim
description: Drive an assigned warehouse robot through ToolsEnabled Sim MCP, coordinate live rounds, and verify crate deliveries and collision results.
---

# ToolsEnabled Sim

Use the bound MCP connection; do not start a second hub. Read `sim.status` and `sim.observe` for the assigned robot before planning. Observe exposes pose, assigned `crateId` and `zoneId`, task identifiers, nearby objects, contacts, all destination zones and `deliveryAreas`. Coordinates are metres; heading zero points east, positive yaw turns south. The planner avoids current obstacles but does not predict moving peers.

In live mode include the current `sim.status.live.round` in every robot mutation. Issue a bounded command, then `robot.submit` once for that round. Every active robot must submit, including while a previous goto continues. The launcher steps after all submissions or the deadline; a missing robot gets a recorded hold. The coordinator cannot command live robots. In manual mode the coordinator calls `sim.step` after collecting commands. Thinking time never advances physics. After a stale-round or budget refusal, read status again and replan; do not flood retries. A motion/share refusal can leave the round active, so submit if status still permits it.

Use `robot.goto` to approach the assigned crate, then `robot.grab` when it is within 0.85 m and in front. A held crate sits about 0.75 m ahead of the robot. Plan the robot waypoint so the **crate center** reaches the recommended zone center. A crate counts only when released (not held) and fully inside its assigned zone: `abs(crate.x - zone.x) <= width/2 - 0.3` and `abs(crate.y - zone.y) <= depth/2 - 0.3`. The scorer uses this fixed 0.3 m margin on each axis, without a rotated-footprint, speed or settling-time test. `deliveryAreas.centerBounds` uses a conservative 1e-6 grid that passes the scorer; aim at the center to allow for motion error.

Release, advance or submit, then verify pose, contacts and `delivered`. A reached waypoint or a center merely inside the drawn zone is not proof of delivery. Report score, delivered/total, collisions and the last verified tick; distinguish partial progress from completed delivery. `complete`, `live.stopped`, `stopReason` and `remainingTicks` explain termination. Reset and scenario changes create a new run while preserving old logs; request a reset only for the user's intended work, with coordinator/human authority.

Capture and replay are human-run local commands, unavailable through MCP; there is no dashboard or human-control link. Never read connection files, host logs or credentials to acquire another robot's identity. Each private connection file belongs to one role and agent; local same-user file tools are not an isolation boundary. MCP offers no capture, export, upload, publishing or human-control reissue tool. If a connection fails, report the error and let the human check the private file and owning hub.

For host installation and external prerequisites, see [CLAUDE-INSTALL.md](../../docs/CLAUDE-INSTALL.md). For exact command bounds and delivery semantics, see [MCP.md](../../docs/MCP.md); for round and budget behavior, see [LIVE.md](../../docs/LIVE.md).
