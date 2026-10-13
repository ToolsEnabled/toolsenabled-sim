# Sim commands

Claude Code 2.1.287 exposes `/sim` as a local view pane. Opening a pane reads only the configured private connection and its role-scoped view, or an explicitly selected private run root. No pane starts a model turn, calls an MCP tool, advances physics, submits a robot, starts a server or launches Chromium. Help is static. Refresh is explicit; there is no polling or startup read. The host may independently launch its configured MCP shim at startup.

Set the plugin's required `connection_file` to this session's absolute connection path. Optionally set `run_root` to the owner's absolute 0700 hub root for history after clean shutdown. Copied connection files for separate accounts do not identify a readable hub root; use the online view there. The CLI uses `SIM_CONNECTION` or `--connection`, and optional `SIM_RUN_ROOT` or `--root`. It never searches for another capability. A missing connection has no verified role: offline views show poses, holding, scores, maps and shared launcher commits, omitting private agent/task/ledger mappings.

`<sim-dir>` below is the absolute extracted or installed plugin directory, for example `/absolute/toolsenabled-sim/sim`. CLI help prints its actual installed path. Codex invokes these CLI reads with `!`; that output can enter the **next model turn**, so the CLI applies the same role and secret filters as the pane. This is a CLI equivalent, not a native Codex slash pane. The Codex action skill mention is `$toolsenabled-sim:toolsenabled-sim`.

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

Use `1`–`9`/`0` to select a row, `n`/`p` to page, `b` to leave detail, `r` to reload, `h` for help, and Esc or `q` to close and restore the composer. Long detail wraps into separate pages. Run detail has `e` for events; event view has `a` to cycle all/actions/rounds. The Keys line lists the currently available actions. All these keys remain claimed during loading, errors and at page boundaries: dim controls explain why an action is unavailable, and `q` can close while a read is pending. Static help and detail cannot reload. A visible revision pins the page: if files change, reload instead of mixing revisions. Static help has a static version marker. CLI `--json` returns the bounded page; follow `nextOffset` or opaque `nextCursor` together with `--revision`. Pages hold at most ten rows and output at most 64 KiB; each file read is bounded to 512 KiB, with at most 4096 retained root entries. Scenario arguments in history are summarized as names/counts. Controls, ANSI and bidi characters are visible escapes, and truncation is marked.

Native action names are fully qualified. `/sim <action>` only points to that native name. It does not secretly submit a prompt. A native action starts only from your own prompt, at the terminal or through Remote Control; a message from another session, a channel, a schedule, an SDK host or another plugin is refused. Before any model turn the hook checks the arguments and runs a read-only preflight. If the arguments, role/mode, live participation, coordinates or scenario file are wrong, it prints usage or opens a notice instead of a model turn. Otherwise it passes the command on unchanged: the prompt receives your arguments exactly as typed and asks the model to read `sim.status`, whose `whoami` names this connection's bound robot, and to use the existing bound MCP tools with normal approval handling. Runtime validation remains authoritative if state changes after preflight.

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

For Codex verbs, the skill runs the same read-only preflight (`sim-view.mjs action --json`, JSON stdin `{ "verb": "hold", "args": [] }`), then uses the validated robot ID and role with the existing MCP connection. No reset or identity switch is implied by a delivery request. Live coordinators cannot drive robots. Manual driver commands wait for coordinator stepping; live commands submit one batch and wait for a new round.

The replay pane provides guidance only. The person runs `tools/replay.mjs <absolute-run-directory>` explicitly for byte verification. Capture requires an external Playwright-compatible Chromium and a new output directory. With a known root, the printed capture command passes `--seconds` equal to the run's recorded length, so it captures the whole run; a run with no recorded tick yet, such as a just-reset run, gets no capture command. Neither replay verification nor capture runs automatically in the pane, and capture/replay never becomes a model action. Historical runs without the new current pointer can be listed with `--root`; select a particular run with `--run` for events or replay. No stale lock or highest directory is treated as evidence of a running hub.

The pane reader and action preflight start with only `PATH`, `LANG`, `SIM_CONNECTION` and `SIM_RUN_ROOT`. Client credentials and Node loader settings are removed before Node starts. This Linux launch uses `/usr/bin/env -i`.
