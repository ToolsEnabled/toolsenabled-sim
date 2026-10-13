---
description: Hold the bound robot in place
argument-hint: "[robot: coordinator manual only]"
disable-model-invocation: true
---

The person explicitly requested this Sim action. The native command preflight supplies this JSON as data:

$ARGUMENTS

Use only this session’s existing bound Sim MCP connection and the supplied robotId, role and mode. First read sim.status and recheck the current round; preflight is a snapshot, not authority to bypass runtime checks. Preserve normal tool approvals. Never inspect connection files, switch identities, invoke a shell to control the hub, or use capture/replay/server tools. If the role, mode, assignment or round no longer matches, stop and explain; never guess a robot ID.

Use robot.drive for this robotId with v=0, w=0 and duration=1. In live mode include the current round and call robot.submit once. In manual mode report that a coordinator step is pending. Keep the held crate attached; do not release or reset. Observe the resulting state.
