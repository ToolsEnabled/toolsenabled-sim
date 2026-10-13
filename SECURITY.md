# Security policy

ToolsEnabled's security policy applies to every ToolsEnabled product; this file states it for ToolsEnabled Sim. The full policy lives at https://toolsenabled.ai/security/. The latest release of Sim is the supported one; fixes ship as a new release.

## Report a problem

Please report a security problem privately, not in a public issue:

- use **Report a vulnerability** on this repository's **Security** tab (GitHub's private vulnerability reporting, enabled for this repository: https://github.com/ToolsEnabled/toolsenabled-sim/security/advisories/new), or
- email **security@toolsenabled.ai**.

Reports from anyone are welcome, including from the directories that list this plugin. Tell us the Sim version (the `version` in `manifest.json` and `package.json`, which your agent CLI's plugin list also shows), what you found, and how to reproduce it. We read every report, reply as soon as we can, keep you informed while we fix it, tell you when the fix is released, and credit you in the release notes if you want that.

## What we ask

Good faith means:

- you test on computers, accounts and projects that are yours or that you have permission to use;
- you stop once you can show the problem, and do not use it to go further;
- you do not access, change or keep other people's data beyond what you need to show the problem, and you delete it afterwards;
- you do not disrupt services or other people;
- you give us a reasonable chance to fix the problem before you publish it. We will not ask you to stay silent indefinitely; if we have not fixed it within 90 days of your report, you may publish.

If you are unsure whether something is covered, ask us first at the addresses above.

## Safe harbor

We want people to look for problems in Sim, and we will not treat good-faith research as an attack. If you research and report in good faith under this policy:

- we consider your research authorized, and we will not bring or support any legal action against you for it, including under anti-hacking, anti-circumvention or similar laws;
- we waive any part of our own terms that would otherwise stop you from doing that research;
- if someone else takes legal action against you for research that followed this policy, we will make it known that your research was authorized by us.

This safe harbor covers ToolsEnabled's own code and releases. It cannot grant permission for other parties' systems: report a problem in an agent CLI, a model provider or any other software we did not write to its own maker.

## Rewards

ToolsEnabled is a small, self-funded company. We do not pay rewards for reports. We are grateful for every one, and we will credit you publicly if you want that.

Like every ToolsEnabled release, Sim is provided "as is", without warranty of any kind, as https://toolsenabled.ai/terms/ says. This policy says how we handle reports, not that any release is free of problems.

## Security boundaries of this release

The rest of this file is the security boundaries document that ships with this release, kept as written: what Sim protects, what it does not claim, and the limits it enforces.

# Local security boundaries

The simulation is a local tool. A malicious process running as the same operating-system user can read that user's private connection files, invoke their commands and act as the user. This package does not claim operating-system isolation from such a process. Put mutually untrusted hosts in separate accounts/sandboxes and pass only the intended connection capability.

The shared hub binds to `127.0.0.1` on an ephemeral port. It rejects Origin-bearing requests, foreign Host headers and calls without a random 256-bit per-launch connection capability. The capability selects a fixed role, agent and robot; tool arguments never select a different identity. Existing run roots are refused unless owned by the hub user with mode 0700. Connection files are created exclusively with mode 0600. The shim opens without following symlinks, validates descriptor owner/mode, and rejects a writable or foreign-owned parent. These checks require POSIX ownership support. For a separate-account agent, the operator must deliberately copy only its connection file into a private directory owned by that account; the copy must be owned by that account with mode 0600. Do not share the coordinator file with robot hosts. Each root has one writer lease, and logs use exclusively created run directories. Stale leases after a crash require deliberate local recovery, not automatic takeover.

Simulation time advances only through a coordinator step with an explicit tick budget. In live mode the launcher owns that step and commits only after all active robots submit or the wall-clock budget expires. Round tokens reject delayed commands; deadline holds are explicit recorded actions. Schemas reject unknown fields, nonfinite/out-of-range numbers, unknown scene objects, invalid ownership and oversized arrays. Motion/grasp/reassignment tools have no paths, URLs, shell commands or provider settings. The maximum input frame is 256 KiB, each stdio queue is limited to 32 requests and the hub to four in-flight requests per authenticated capability, including incomplete bodies; the run budget is at most 36,000 fixed ticks and command submissions are bounded between ticks.

Screen capture, upload, publishing, arbitrary file export, undo and human dashboard actions are **not available as MCP tools**. The simulation hub has no routes to start or stop capture, start a renderer or upload data. The replay asset server is GET-only with a fixed path allowlist under a random 256-bit per-launch capability URL. Every asset and the trajectory require that capability; no-referrer and nosniff headers are set. Keep the printed URL private. Its browser uses a private context and blocks requests outside that ephemeral loopback origin. `tools/capture.mjs` is a local CLI invoked by the operator and reads a supplied run directory. It records simulated frames, not the user's desktop.

There are no human-only HTTP action routes or interactive dashboard sessions in this package. If a future dashboard adds human-only controls, those actions must **require the dashboard session**: a one-time secret in a launch URL fragment, exchanged by POST with the correct Origin for a per-launch token kept in origin-scoped sessionStorage. Every human control must require that token in a custom header, plus Origin, Host and JSON validation. A cookie alone, or correct Origin and JSON alone, must never authorize such routes. No GET may expose a control or session token. Current tests explicitly reject local Origin+JSON requests and fail if capture/upload/human-only names appear in any MCP catalog.

Inputs and Fleet work-record content are data. Importing a task or ledger ID does not establish an external permission or prove that a Fleet server accepted it. The optional isolated Fleet proof records actual task-store and ledger transitions; normal imported work records remain the launcher's responsibility. Logs contain assignments and actions, so treat them as private operational data. Connection capabilities and claim tokens are excluded from exported simulation artifacts.

The hash chain is tamper-evident only relative to a trusted terminal hash; anyone able to rewrite a whole file can compute a new chain. Full physics replay additionally checks that the recorded actions generate the recorded states. Neither mechanism is a digital signature.

The renderer launches an isolated Chromium profile with Chromium sandboxing disabled for compatibility with the supplied portable sandbox runtime. Keep it local and feed it only validated scene/log data. It loads only package-owned scripts; no arbitrary website or script execution is exposed. Portable browser updates require re-qualifying frame hashes.

Live robot commands and submissions are accepted only from the capability bound to that robot. The coordinator cannot send them. Version 2 journals record caller role/agent ID beside the target robot ID(s), including submissions; live audit rows do the same. Automatic holds/steps identify the launcher. Captions use the actual command caller, and use a driver label only when that caller matches the assigned robot agent. Separate profiles/projects organize configuration; they do not isolate same-user processes. Use the account boundary described in SECURITY.md for mutually untrusted hosts.

Plugin configuration joins an existing hub through an absolute `SIM_CONNECTION` path. Claude passes its connection-file option through the environment; Codex uses the host environment. Capability contents never belong in argv, settings or prompts. Local project install scope does not isolate simultaneous hosts or same-user file tools. Never use connection files or host logs to acquire another agent’s authority. Sim has no dashboard/session link or MCP reissue route; the human owns local capture/replay and normal hub recovery. See docs/CLAUDE-INSTALL.md for host diagnostics and the POSIX prerequisite.
