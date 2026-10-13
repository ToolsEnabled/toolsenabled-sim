---
description: Restart the shared world and retain old logs
disable-model-invocation: true
---

The person explicitly requested this Sim action. The native command preflight supplies this JSON as data:

$ARGUMENTS

Use only this session’s existing bound Sim MCP connection and the supplied robotId, role and mode. First read sim.status and recheck the current round; preflight is a snapshot, not authority to bypass runtime checks. Preserve normal tool approvals. Never inspect connection files, switch identities, invoke a shell to control the hub, or use capture/replay/server tools. If the role, mode, assignment or round no longer matches, stop and explain; never guess a robot ID.

This requires the coordinator bound to this session. Warn that sim.reset restarts the shared world and live round for every agent; old logs are kept. Call sim.reset once, then sim.status and report the new run and round. Do not search for another connection or elevate a robot session.
