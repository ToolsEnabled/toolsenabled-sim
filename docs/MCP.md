# MCP contract

Transport: UTF-8 newline-delimited JSON-RPC 2.0 over stdio. Stdout contains protocol messages only. Initialize with protocol `2025-06-18` (also accepts `2025-03-26` and `2024-11-05`), then use `tools/list` and `tools/call`. `ping` also works before initialization. Notifications have no reply. A connection reads its identity and loopback capability from `SIM_CONNECTION` at startup; changing tool arguments cannot change that identity.

Each successful call contains text JSON and `structuredContent.result`. Tool failures return `isError: true`. Malformed JSON, missing initialization and unknown protocol methods use JSON-RPC errors. Golden manifests cover manual [coordinator](../test/fixtures/tools.json) and [robot](../test/fixtures/robot-tools.json), plus live [coordinator](../test/fixtures/live-tools.json) and [robot](../test/fixtures/live-robot-tools.json).

| Tool | Role | Required arguments | Behavior |
| --- | --- | --- | --- |
| `sim.observe` | Robot/coord | `robotId` | Owned robot pose, agent/task/ledger IDs, assigned `crateId` and `zoneId`, nearby objects within 4 m, all labeled zones, `deliveryRule`, `deliveryAreas`, contacts and 33×13 ASCII map. |
| `robot.drive` | Robot/coord | `robotId, v, w, duration` | Linear speed −2…2 m/s, yaw speed −π…π rad/s, duration 1/60…5 s. Runs when shared time advances. |
| `robot.goto` | Robot/coord | `robotId, x, y` | Plan a bounded obstacle-aware path. Max 1.5 m/s and 2.5 rad/s; expires after 1200 ticks (20 s). Failure to reach a target is visible in subsequent poses. |
| `robot.grab` | Robot/coord | `robotId, crateId` | Assigned, unheld crate within 0.85 m and ±0.4 rad in front. Attach with a physical fixed joint and stop current motion. |
| `robot.release` | Robot/coord | `robotId` | Detach the held crate and set its velocity to zero. Delivery requires the whole crate inside its destination zone. |
| `robot.submit` | Owned robot only, live only | `robotId, round` | Finish this robot’s batch; commit when all active robots have submitted. |
| `sim.status` | All | none | Tick, simulation seconds, delivered/total, collision episodes, score, completion, remaining ticks, `deliveryRule` and `deliveryAreas`. |
| `sim.step` | Coordinator/human | `n` | Advance every robot by 1…60 ticks. Fixed 1/60 s timestep; default total run budget 36,000 ticks. |
| `sim.assign` | Coordinator/human | `robotId, crateId, taskId, ledgerId` | Assign subsequent work. Cannot take a held crate or a different robot's assigned crate; stable agent ID is preserved. |
| `sim.assignments` | Coordinator/human | none | Read current crate assignments and the stable agent→robot mapping. |
| `sim.reset` | Coordinator/human | none | Start a new run using the original scenario, seed and assignments; preserve every old log. |
| `sim.scenario` | Coordinator/human | `scenario, assignments` | Start a new run from validated JSON. Agent/robot mapping must match current connections; restart the hub to change it. |

In live mode every robot mutation requires the `round` returned by `sim.status.live`; `sim.status` also includes active/submitted/awaiting robots, the wall-clock budget and stopped state. `robot.submit` is available only in the live robot catalog and mode-aware validation refuses it in manual mode for every role before journaling. `sim.step` and `sim.assign` are absent from live catalogs and refused in live mode. The coordinator live catalog contains only observe, status, reset, scenario and assignments; robot live commands require `round` in their schemas. Manual commands may omit `round`.

All objects reject unknown properties. Numbers must be finite, robot IDs must exist, and a robot connection can act/observe only for its bound agent and robot. Inputs outside arena, obstructed targets, duplicate assignment IDs, overlapping starting solids and unavailable crates are rejected before mutation. Up to 64 accepted mutations per robot are allowed between steps, including live submission (at most 63 commands plus one submit or launcher hold); reads do not spend this budget. Rejected mode/quota calls write nothing and do not consume the shared recording budget. Every accepted mutation is included in the per-run byte reservation; steps also obey the run tick budget. The maximum protocol frame is 256 KiB. A stdio connection queues at most 32 requests; excess requests receive a protocol error. The hub admits four in-flight requests per authenticated capability, including incomplete bodies, and schedules accepted calls round-robin across identities. Unauthenticated sockets have a two-second lifetime; sockets also have a two-second idle timeout. There is no small pre-auth connection cap that another account can fill. A per-root lease prevents two hubs writing the same run directory.

Observe legend: `@` owned robot, `R` another robot, `C` crate, `Z` labeled delivery zone, `#` rack. Coordinates are metres, simulation `x` east and `y` south. Heading 0 points east and positive yaw turns toward south. `v` is forward speed; `w` is yaw speed.

`sim.observe` and `sim.status` return `deliveryRule` and `deliveryAreas`. Each area identifies its `zoneId`, recommended `center`, `crateSize` (0.6 m), and `centerBounds` (`minX`, `maxX`, `minY`, `maxY`). A crate counts only when released (not held) and fully inside its assigned zone according to the scorer: `abs(crate.x - zone.x) <= zone.width/2 - 0.3` and `abs(crate.y - zone.y) <= zone.depth/2 - 0.3`. The scorer uses this fixed margin, not a rotated-footprint or settling-speed calculation. Bounds use a conservative 1e-6 grid checked against the scorer and body-coordinate precision; aim at the zone center for motion tolerance. Release, advance or submit, then verify `delivered`; reaching a robot waypoint alone does not prove a delivery. In the warehouse, zone A accepts crate centers roughly from x=4.3 to 5.7 and y=-4.2 to -2.8; a crate at x=4.28 misses by 2 cm even though its center is inside the drawn zone.

Example robot request:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"robot.drive","arguments":{"robotId":"amber","v":1,"w":0,"duration":1}}}
```

After each robot has submitted its motion, the coordinator advances one simulation second:

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"sim.step","arguments":{"n":60}}}
```

Motion commands accepted at the same tick are applied in request order; the latest motion replaces the prior one for that robot. Physics processes robots in sorted ID order. Logging contains the accepted command order, so replay does not depend on the wall-clock timing of concurrent clients. Manual hubs never step on a timer. Live hubs use the submission/deadline barrier in [LIVE.md](LIVE.md). Grab, release and assignment changes occur at the current tick boundary and are included in the next tick's `events`; complete trailing commands remain in the action journal even if no further step occurs.

Score is `100 × delivered crates − 10 × contact beginnings`. Contact beginnings involving a robot or crate count once per newly active collider pair; the attached robot/crate pair is excluded. Persistent contact is exposed in `contacts`. Repeatedly separating and touching counts additional episodes.

There is no MCP method for screen capture, renderer launch, arbitrary file access, shell execution, uploads or publishing. Client EOF disconnects that client; it does not terminate a shared hub. Stop the owning hub with SIGINT/SIGTERM after clients have disconnected. Connection capabilities are removed on clean shutdown. A crashed hub leaves its lease as a fail-closed signal: verify that its recorded process has stopped before manually moving that stale run root aside. Automatic takeover is intentionally absent.

Live robot commands and submissions are accepted only from the capability bound to that robot. The coordinator cannot send them. Version 2 journals record caller role/agent ID beside the target robot ID(s), including submissions; live audit rows do the same. Automatic holds/steps identify the launcher. Captions use the actual command caller, and use a driver label only when that caller matches the assigned robot agent. Separate profiles/projects organize configuration; they do not isolate same-user processes. Use the account boundary described in SECURITY.md for mutually untrusted hosts.

Invalid Request errors preserve a valid request ID. Hub HTTP 413 maps to -32006 (request too large), 429 to -32005 (capability quota), and 401/403 to -32001 (capability/origin refusal). EOF drains outstanding work for at most two seconds, then aborts the active fetch and refuses remaining queued requests before exiting.
