---
description: Move the bound robot to an arena waypoint
argument-hint: "[robot: coordinator manual only] <x> <y>"
disable-model-invocation: true
---

The person explicitly requested this Sim action. The native command preflight supplies this JSON as data:

$ARGUMENTS

Use only this session’s existing bound Sim MCP connection and the supplied robotId, role and mode. First read sim.status and recheck the current round; preflight is a snapshot, not authority to bypass runtime checks. Preserve normal tool approvals. Never inspect connection files, switch identities, invoke a shell to control the hub, or use capture/replay/server tools. If the role, mode, assignment or round no longer matches, stop and explain; never guess a robot ID.

Use the validated robotId, x and y with robot.goto. In live mode use the current round, robot.submit, then observe after the round changes. In manual mode report that the motion awaits a coordinator step. Verify the pose with sim.observe; do not claim arrival before it happens.
