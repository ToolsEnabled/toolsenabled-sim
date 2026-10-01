# Live agents

The live launcher owns the shared clock. A round ends when **every active robot calls `robot.submit`**, or its wall-clock budget expires. The default budget is **120 seconds per round** and the default step is **60 physics ticks (one simulation second)**. The first budget starts when the launcher prints registrations; subsequent budgets start after the previous step finishes. Agent thinking time never changes the fixed 1/60-second physics timestep.

## Start and register

Export a work record with one assignment per robot. Set `agentId` to the actual agent identity and `driverLabel` to its actual driver, such as `CLAUDE CODE` or `CODEX`. Labels are recorded in the immutable trajectory header and used verbatim (uppercased by the embedded glyph renderer) in multiview captions. They are operator-supplied attribution, not proof that a particular provider executed the commands. Keep scripted tests labeled as scripted drivers. Older recordings without a label display their recorded `agentId`.

Each assignment has this shape; include all three or four robots and their own crate/task/ledger IDs:

```json
{
  "robotId": "amber",
  "agentId": "warehouse-agent-a",
  "driverLabel": "CLAUDE CODE",
  "crateId": "cargo-a",
  "taskId": "your-claimed-fleet-task-id",
  "ledgerId": "your-ledger-id"
}
```

```sh
node tools/live.mjs --root ./runs/live --work-record ./work-record.json
```

The launcher keeps running and prints a separate role/agent/robot section for each registration. Its Claude Code and Codex commands are ready to copy directly into a POSIX shell. Choose one host for each agent and copy only that agent's registration. Use `--json` for machine-readable output containing commands plus JSON/TOML client configurations; decode the JSON command string before executing it. On other shells, use those configuration objects instead. Separate profiles/projects organize settings; they do not isolate processes running as the same user. Mutually untrusted hosts need the separate-account or sandbox boundary in [SECURITY.md](../SECURITY.md).

The launcher does not run either agent CLI, alter client settings, approve tools, or call a model. Every MCP process reads its private `SIM_CONNECTION` file. The hub's random capability binds its identity; tool arguments cannot choose a role or another robot. Each registration points to the same shared hub. Keep the coordinator registration with the coordinator. See the official [Claude Code MCP registration](https://code.claude.com/docs/en/mcp#add-mcp-servers-from-json-configuration) and [Codex MCP registration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) documentation for client configuration scope.

Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `--budget-seconds` | `120` | Wall-clock thinking budget; positive, at most 3600 seconds, whole milliseconds. |
| `--step-ticks` | `60` | Physics ticks per committed round, 1–60. The final batch is clipped to remaining ticks. |
| `--active` | All robots | Comma-separated participating robot IDs. Inactive robots hold on each step. |
| `--max-ticks` | `36000` | Total bounded run length, 1–36000 ticks. |
| `--scenario` | Included warehouse | Validated scene JSON. |
| `--json` | Off | Emit structured registrations/configuration instead of directly copyable commands. |

## Step size and recording limits

Use the default `--step-ticks 60`, or 30–60 ticks per round for typical agent-driven demos. `--step-ticks 1` is supported: it advances only 1/60 of a simulation second per round and can record 60 times as many submissions, holds and commits for the same simulated duration. The 120-second wall-clock budget applies to every round regardless of its step size. Manual `sim.step` has the same 1–60 tick range.

Runs cap the combined trajectory, action journal and live audit at 128 MiB. Half that cap is divided equally into independent robot command shares; command reservations include both journal copies, audit overhead and motion-state storage. A `goto` is planned before reservation; its actual serialized path and bounded remaining lifetime determine the reserve. Replacing or finishing motion releases unused future storage. With a small API-supplied recording cap, also shorten `maxTicks` to fit the intended run. A command that exceeds its robot’s share returns `ROBOT_BYTE_BUDGET` in the core API (an explanatory error message over MCP), writes nothing and leaves the run active. Other robots keep their own shares. Continue with `robot.submit` after a refusal, or let the deadline apply a launcher hold. Reset starts a new run with fresh shares. Reads do not spend a share.

The remaining recording space supports world frames and control traffic. If a mutation cannot fit the whole-run reservation, it returns `RUN_BYTE_BUDGET` (an explanatory run-wide error over MCP), journals a byte-budget stop immediately and cancels the live deadline. It does not leave the round waiting for the wall-clock budget to expire. Submit, grab and release do not reserve the current motion’s future storage again.

For the included warehouse at the 128 MiB cap, use about **30,000 ticks or fewer** with `--step-ticks 1`. An idle 36,000-tick live run already approaches the cap, and normal traffic can stop it around 32,800–34,550 ticks. This is headroom guidance, not a guarantee: larger scenes or heavier traffic can stop earlier. Prefer 30–60 ticks per round for typical demos. Smaller steps increase control-log overhead even when agents issue no new motion commands.

## Agent loop

1. Call `sim.status` and `sim.observe` for your robot. Read `live.round` from status. A token such as `1:60` identifies both the run and the current tick boundary.
2. Issue your normal `robot.drive`, `robot.goto`, `robot.grab` or `robot.release` commands, including that exact `round` on **every** command.
3. Call `robot.submit` with your `robotId` and `round`. This closes your command batch. If yours is the last submission, the response contains the advanced tick and next round. Otherwise, later `sim.status` calls show `submitted` and `awaiting` until the step commits.
4. Observe the next round before planning again. If a command reports a stale round, discard the old plan and reobserve. Do not simply attach the new token to an old command.

Example commands after reading the current round (replace this token with the one actually returned):

```json
{"name":"robot.goto","arguments":{"robotId":"amber","x":-4.5,"y":-3.5,"round":"1:0"}}
{"name":"robot.submit","arguments":{"robotId":"amber","round":"1:0"}}
```

Submission with no new command explicitly continues the previous motion. To hold voluntarily, issue `robot.drive` with `v: 0`, `w: 0`, a positive duration, and the current round, then submit. `goto` may need several rounds; submit every round even while it continues. Calls return promptly rather than holding an MCP request open during another agent's thinking time. Poll status at a modest rate while waiting.

After submission, further commands or duplicate submissions for that robot/round are refused. A delayed command arriving after a deadline or reset is refused. Each active robot may issue at most 63 commands per round, reserving the 64th mutation slot for its submission or a launcher timeout hold. Submission counts toward the core per-tick budget. The first submission per robot per tick uses control recording space, so exhausting a robot’s command share does not prevent it from completing the barrier. On deadline, the launcher replaces every missing robot's motion with a journaled zero-velocity drive, then advances. A missing robot's earlier grab/release remains applied at the tick boundary; the timeout stops motion, it does not roll back accepted commands. Disconnecting does not silently remove a robot from the active set. It holds at subsequent deadlines until the hub stops or the operator starts a new active set.

Manual `sim.step` and mid-run `sim.assign` are rejected in live mode. Coordinator reset/scenario changes create a new immutable run and fresh round token, retaining the original agent/robot/driver mapping. Restart the hub to change that mapping or active set. Stepping stops automatically on complete delivery or exhaustion of the tick budget; the hub remains available for status/replay inspection until SIGINT/SIGTERM/SIGHUP. Clean shutdown cancels the timer and removes connection files.

## Replay and evidence

`live.jsonl` records each commit's round, reason (`submitted` or `deadline`), submitted robots, held robots and tick count. The authoritative `actions.jsonl` records all accepted commands, explicit timeout holds and committed `sim.step` operations. Round tokens are ordinary recorded arguments. Physics replay runs these actions without a live timer and must reproduce **every trajectory byte**. Different live arrival orders can produce different recordings; replay of a given recording is deterministic.

```sh
node tools/replay.mjs ./runs/live/run-0001
```

Automated tests use real stdio processes, including an 11-second delayed submission under the 120-second default, shortened deadline budgets, continuing-motion holds, stale-round/ownership rejection, command-budget exhaustion, reset, launch registration, clean EOF/shutdown, and full physics byte comparison. These tests do not invoke Claude Code or Codex models. A real host/model session is a separate integration qualification.

Live robot commands and submissions are accepted only from the capability bound to that robot. The coordinator cannot send them. Version 2 journals record caller role/agent ID beside the target robot ID(s), including submissions; live audit rows do the same. Automatic holds/steps identify the launcher. Captions use the actual command caller, and use a driver label only when that caller matches the assigned robot agent. Separate profiles/projects organize configuration; they do not isolate same-user processes. Use the account boundary described in SECURITY.md for mutually untrusted hosts.

Both launchers register signal handlers before allocating the hub lock or capabilities. A signal during startup defers cleanup until the hub exists and suppresses registration output when already observed. Shutdown is requested once, removes all remaining connection files and the root lock even if a capability file was already removed, and lets stdout drain before the process exits. Completed logs remain intact.
