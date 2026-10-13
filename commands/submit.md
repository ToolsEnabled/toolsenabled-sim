---
description: Submit the bound robot’s current live round
disable-model-invocation: true
---

The person explicitly requested this Sim action. The native command preflight supplies this JSON as data:

$ARGUMENTS

Use only this session’s existing bound Sim MCP connection and the supplied robotId, role and mode. First read sim.status and recheck the current round; preflight is a snapshot, not authority to bypass runtime checks. Preserve normal tool approvals. Never inspect connection files, switch identities, invoke a shell to control the hub, or use capture/replay/server tools. If the role, mode, assignment or round no longer matches, stop and explain; never guess a robot ID.

Use robot.submit once for the bound robotId and current round. This requires an active robot connection in live mode that has not yet submitted. Report submitted/awaiting from sim.status; do not step for the launcher or submit for another robot.
