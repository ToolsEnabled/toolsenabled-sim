---
description: Assign follow-on work in manual mode
argument-hint: "<robot> <crate> <task-id> <ledger-id>"
disable-model-invocation: true
---

The person explicitly requested this Sim action. The native command preflight supplies this JSON as data:

$ARGUMENTS

Use only this session’s existing bound Sim MCP connection and the supplied robotId, role and mode. First read sim.status and recheck the current round; preflight is a snapshot, not authority to bypass runtime checks. Preserve normal tool approvals. Never inspect connection files, switch identities, invoke a shell to control the hub, or use capture/replay/server tools. If the role, mode, assignment or round no longer matches, stop and explain; never guess a robot ID.

This requires the coordinator in manual mode. Use sim.assign with the validated robotId, crateId, taskId and ledgerId, then read back sim.assignments. Keep the stable agent mapping unchanged. Do not reset or advance the world.
