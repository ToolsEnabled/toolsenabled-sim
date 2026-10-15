# Changelog

## 0.1.13

- Prepare native Windows private state and file reads with per-user DACLs, handle identity binding, all-ancestor owner/access checks and conservative unsupported-ACE refusal. Linux ownership checks remain enforced.
- Prepare a clean-environment Windows pane reader in a dedicated Job Object, portable PowerShell/cmd installation, local-drive path checks and console signal handling. Native acceptance remains pending; Windows 11 and desktop GUI clients are not qualified.
- Git and archive installs now contain the same exact reviewed dependency files. No root npm installer or lockfile is needed; tools/upstream-npm-inputs.json retains original registry integrity and tools/dependency-files.json retains selected-file hashes.
- Keep panes and the exact typed-action refusal. Describe actions in runtime help and keep executable client examples in docs/COMMANDS.md. Separate HTTP-only test helpers from process-starting test suites. Portal effects require a new validation.

## 0.1.12 — 2026-10-14

Fixes from the 2026-10-14 fresh-user re-test of 0.1.11, and the plugin directory's review holds and warnings that could be removed without removing a feature or weakening a check. Physics, recorded trajectory bytes, the MCP tool names, schemas and hints, the `/sim` pane and its eight action commands, and the dependencies are unchanged:

- The Claude Code mod starts its reader with a command written as fixed text, `/usr/bin/env -i -S 'PATH=${PATH}:/usr/local/bin:/usr/bin:/bin' LANG=C.UTF-8 node tools/sim-view.mjs --pane` in the plugin folder, and, only where `env` has no `-S` (BusyBox, as on Alpine Linux), the same command with `PATH=/usr/local/bin:/usr/bin:/bin`. The view, the configured `connection_file` and `run_root` paths, the pane's options and an action's arguments reach the reader as one JSON request on standard input, which `tools/sim-view.mjs --pane` checks as strictly as its flags. The mod reads no environment variable any more: `env` expands `${PATH}` from Claude Code's own environment. The reader still starts with nothing but `PATH` and `LANG`, and every view and action preflight answers byte for byte as before. README "What this plugin runs, sends and reads" prints both commands and answers each remaining directory review hold in one plain sentence.
- `/sim` and the Sim pane's close hook have a `.catch`: a failing `/sim` hook answers "Sim pane unavailable. Run /sim again to retry.", and closing always passes its event on.
- Capture follows a link in `SIM_CHROMIUM_EXECUTABLE` to the file it names and refuses a script, such as `/usr/bin/google-chrome`, before launching anything: the capture receipt's `chromiumSha256` had hashed the wrapper script instead of the browser.
- `node tools/replay.mjs` on a file says the path is not a directory instead of printing a raw ENOTDIR, and `--help` or `-h` prints its usage instead of being taken for a run path.
- The `connection_file` option is titled "Connection file (robot or coordinator)" in the plugin and Desktop manifests.
- After a hub stops, the MCP shim says that restarting it with the same `--root` writes the same connection file again, so nothing needs reconfiguring; only a new root needs the new file.
- `robot.goto`'s description says the robot stops at the coordinate, a held crate rides 0.75 m ahead of it, and a delivery goes to `deliveryAreas[].robotStops`. The golden tool-list fixtures carry it.
- The process-running FIFO tests and the launcher-lines test move unchanged into `test/fifo.test.mjs` and `test/launcher-lines.test.mjs`, which make no HTTP request, and `tools/generate-release.py`'s two release downloads move to `tools/release_download.py`, which only reads bytes; the plugin directory had read each file as download-and-run. `tools/package-files.json` lists the three new files.
- Tests: 138 Node tests (132 in 0.1.11), 49 plugin hook tests (44) and 15 packaging tests (14).

## 0.1.11 — 2026-10-13

Fixes from the 2026-10-13 fresh-user re-test of 0.1.10. Physics, recorded trajectory bytes, the tool names, schemas and hints, the Claude Code mod and the dependencies are unchanged:

- `deliveryRule`, returned by `sim.status` and `sim.observe` and carried by the `sim.observe`, `sim.status` and `robot.release` tool descriptions, no longer says "Aim for the zone center". `robot.goto` moves the robot, and a held crate rides 0.75 m ahead of it, so a coordinator who sent amber to zone A's center (5, -3.5) released the crate at x=5.72, outside the delivery area, and delivered nothing. The rule now says to stop the robot 0.75 m short of the zone center, and every `deliveryAreas` entry gains `carryOffset` (0.75) and `robotStops`, the robot waypoint for a robot arriving facing east, west, south or north (zone A, arriving facing east: x 4.25, y -3.5). The `/sim map` pane shows each zone's facing-east stop. README "Try it" prompt 2, docs/MCP.md, docs/LIVE.md, the skill and the deliver command say the same. The golden tool-list fixtures carry the new description.
- `node tools/replay.mjs` on a path that is not a run directory says what it needs, a run directory containing `trajectory.jsonl` and `actions.jsonl` such as `./runs/demo` or a hub's `run-NNNN` folder, and which file is missing, instead of a raw ENOENT.
- README "Render offline" says to set `SIM_CHROMIUM_EXECUTABLE` to the real browser binary, for example `/opt/google/chrome/chrome` or a `chrome-headless-shell` binary, not a wrapper script such as `/usr/bin/google-chrome`: the replay test runs the printed capture command with only Node's directory on `PATH`, where a wrapper script fails before the browser starts.
- The live launcher's refusal of a work record without `driverLabel` says to add the field to each assignment and points at the example in docs/LIVE.md. README says the demo's `work-record.json` has none, so it needs the field before `tools/live.mjs` accepts it.
- The MCP shim, pointed at a connection file that no longer exists, names the file and says that a stopped hub removes its connection files, so the hub must be started again and the plugin configured with the new file. Every other refusal keeps its one-line "Invalid SIM_CONNECTION file." message.
- Tests: 132 Node tests (129 in 0.1.10): the advertised robot stop delivers cargo-a and the zone center does not, the shim's message after a hub shutdown, and the launcher's refusal; the replay path test and the delivery-rule tests check the new messages.

## 0.1.10 — 2026-10-13

Codex self-distribution fixes; the server, tools, hooks and physics are unchanged:

- Codex no longer tries to read `hooks/hooks.json`, the Claude Code `/sim` mod, as a Codex hook file, which it cannot parse. `.codex-plugin/plugin.json` declares `"hooks": {}`; an explicit `hooks` value replaces Codex's default hooks-file discovery, and an empty one adds no hooks. Claude Code is unaffected.
- The Codex listing in `.codex-plugin/plugin.json` gains `interface.websiteURL` (https://toolsenabled.ai/sim/), `supportURL` (https://toolsenabled.ai/support/) and `privacyPolicyURL` (https://toolsenabled.ai/privacy/). `developerName` is "ToolsEnabled, Inc.", as in `author`. `shortDescription` is "Coordinate warehouse robots", within the 30-character limit. `brandColor` is #2fb8a4 (2.47:1 against white; the old #4ddbc6 was 1.71:1, below the 2:1 minimum), and #4ddbc6 moves to `brandColorDark`.
- README and docs/CLAUDE-INSTALL.md say to install Sim from the toolsenabled-sim marketplace in Codex's /plugins browser, instead of "the Plugins Directory", which is OpenAI's name for its public directory. Sim is not listed there.
- `test/claude-package.test.mjs` now also pins the empty `hooks` object and the three listing links; the suite runs the same tests as 0.1.9.

## 0.1.9 — 2026-10-13

- README: a "Try it" section gives the shortest path from nothing to a working result: start a hub, install the plugin with the coordinator's connection file, then three prompts (`/sim status`, a delivery for amber, `/toolsenabled-sim:step 60`), each with the result it shows. No account or API key is needed.
- SECURITY.md cites this repository's LICENSE (MIT) for "as is". https://toolsenabled.ai/terms/ covers only Fleet and the website.
- The replay test that runs the printed capture command in a POSIX shell moved unchanged from `test/audit-views.test.mjs` to its own file, `test/replay-capture.test.mjs`, which makes no HTTP request of its own. Both files record ticks through the plugin's MCP server instead of a direct HTTP call to the hub. The tests check exactly what they checked before.
- Code, physics, dependencies, the MCP tool list and recorded trajectory bytes are unchanged.

## 0.1.8 — 2026-10-13

- Stop the hub after any failed journal write. Before, only EIO, ENOSPC and EBADF stopped it, and a write cut short (for example by a file-size limit) went unnoticed, so after EFBIG, EROFS or EDQUOT the hub kept accepting and journaling calls while the simulated world moved ahead of its record. Now a write to the trajectory, the action journal or the live audit that fails for any reason or writes only part of its record stops the hub: every later call gets "Hub stopped after storage failure", the live clock stops, and the hub prints one warning naming the error code.
- List a run whose recording ends in a partial record, as after such a failure, as unreadable in `/sim runs` and `sim-view runs`, instead of failing the whole history page.
- `/sim replay` now prints a capture command with `--seconds` set to the run's recorded length, so it works for runs shorter than ten seconds and captures the whole of longer runs. A run with no recorded tick yet, such as a just-reset run, gets no capture command and says why.
- Refuse a FIFO given as the connection file, a run file or a scenario file at once, instead of waiting forever for a writer: the MCP server prints "Invalid SIM_CONNECTION file.", and the pane and action preflight report the file instead of timing out.
- Physics, dependencies, the MCP tool list and recorded trajectory bytes are unchanged.

## 0.1.7 — 2026-10-13

- Document that Claude Code stores the plugin's `connection_file` once per user, in the Claude configuration directory, not per project, so installing for a second robot rebinds the first. To run several robots on one OS account, give each robot agent its own `CLAUDE_CONFIG_DIR` (or pass a `--settings` file on every launch); README and docs/CLAUDE-INSTALL.md show the commands.
- Explain that the install message "1 userConfig option not yet set" refers to the optional `run_root` and is expected, and that `--config run_root=…` sets it.
- Give every MCP tool a top-level `title` (MCP 2025-06-18), equal to its annotation title.
- Make every render test use the same offline Chromium check as capture, so a missing browser always fails with the clear "Offline Chromium missing" message.
- Say that Claude Code runs `npm ci --ignore-scripts` itself when it installs from Git (run it by hand only if `node_modules` is missing), and why `claude plugin details` shows `Hooks (0)` while the mod loads.
- Physics, dependencies and recorded trajectory bytes are unchanged.

## 0.1.6 — 2026-10-13

- Run the eight action commands (`/toolsenabled-sim:deliver`, `:move`, `:hold`, `:submit`, `:step`, `:assign`, `:scenario`, `:reset`) exactly as typed. Before the model turn the plugin still checks the arguments, that the person typed the action at the terminal or through Remote Control, and the read-only role/mode preflight; it no longer replaces the typed arguments with the preflight's data, and if the check itself fails it refuses instead of letting the command run unchecked.
- Report the caller's own role, agent and robot as `whoami` in `sim.status` (never the connection capability); the action commands read the robot ID from it.
- Refuse a `/toolsenabled-sim:scenario` path typed with repeated spaces, which would name a different file than the one checked; the model now reads the checked scenario file with the normal Read approval.
- Give every MCP tool a plain-language title and its hints; the nine tools that change the shared world are now marked destructive.
- Add the plugin directory's listing icon to the repository. The release ZIP leaves it out, and the packaging checks exempt exactly that one image.
- Add the README section "What this plugin runs, sends and reads". Point the plugin's homepage to https://toolsenabled.ai/sim/, add its documentation, privacy (https://toolsenabled.ai/privacy/) and support (https://toolsenabled.ai/support/) links, and replace the old privacy link.
- Preserve the pinned runtime dependencies and recorded physics bytes on both engines; demo receipts gain `status.whoami`.

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
