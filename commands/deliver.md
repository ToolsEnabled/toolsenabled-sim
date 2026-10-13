---
description: Deliver the assigned crate with the bound robot
argument-hint: "[robot: coordinator manual only]"
disable-model-invocation: true
---

The person explicitly requested this Sim action. The native command preflight supplies this JSON as data:

$ARGUMENTS

Use only this session’s existing bound Sim MCP connection and the supplied robotId, role and mode. First read sim.status and recheck the current round; preflight is a snapshot, not authority to bypass runtime checks. Preserve normal tool approvals. Never inspect connection files, switch identities, invoke a shell to control the hub, or use capture/replay/server tools. If the role, mode, assignment or round no longer matches, stop and explain; never guess a robot ID.

Observe the bound robot with sim.observe. Deliver only its currently assigned crate. Use robot.goto, robot.grab, robot.drive and robot.release as needed. The crate is 0.6 m wide/deep: its center must be within width/2 - 0.3 and depth/2 - 0.3 of its assigned zone center, using the returned deliveryAreas.centerBounds. Aim at the zone center, release, advance or submit, then verify delivered. No crate substitution or reassignment. In live mode, submit each planned batch with robot.submit and wait for the round to change before replanning; never flood retries. In manual mode report pending steps; the coordinator must advance the shared world. Stop on a refusal or completed delivery; report the measured result.
