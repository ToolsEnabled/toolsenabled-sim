# Scenario and assignment files

`scenarios/warehouse.json` is a complete example. The JSON schema is exported as `scenarioSchema` from `src/schema.mjs` and appears in the golden `sim.scenario` tool manifest. All listed fields are required; extra properties are rejected.

- `version`: 1. `name`: 1–80 characters. `seed`: an unsigned 32-bit integer.
- `arena`: `width` and `depth`, each 6–60 metres, centered at the origin.
- `robots`: 3–4 entries with unique `id`, `x`, `y`, `heading` in [−π, π] and six-digit hex `color`.
- `crates`: 1–32 entries with unique `id`, `x`, `y`, and a destination `zone` ID. Crates are 0.6 m cubes.
- `zones`: 1–16 entries with unique `id`, `label`, `x`, `y`, `width`, `depth`, and `color`. Width/depth are 1–8 m. Labels use ASCII letters, digits, spaces, slash, underscore or hyphen.
- `obstacles`: 0–32 axis-aligned racks with `id`, `x`, `y`, `width`, `depth`. Width/depth are 0.2–20 m.

IDs use 1–48 letters, digits, underscores or hyphens, beginning with a letter or digit. IDs are unique across the whole scene; `coordinator` and `wall-n`, `wall-s`, `wall-e`, `wall-w` are reserved. Every item must fit within arena walls, initial solids must not overlap, and every crate must reference an existing zone. Robots are represented by 0.33 m radius cylinders; validation conservatively checks their 0.66 m square bounds.

A work record has the form:

```json
{
  "version": 1,
  "assignments": [
    {"robotId":"amber","agentId":"script-amber","crateId":"cargo-a","taskId":"task-a","ledgerId":"T1"},
    {"robotId":"teal","agentId":"script-teal","crateId":"cargo-b","taskId":"task-b","ledgerId":"T2"},
    {"robotId":"violet","agentId":"script-violet","crateId":"cargo-c","taskId":"task-c","ledgerId":"T3"}
  ]
}
```

Initial assignments contain one distinct crate per robot, so the initial scene needs at least as many crates as robots. The task and ledger IDs are references, not credentials or permission grants. The hub trusts the launcher to associate the correct connection capability with the correct host. `sim.assign` can replace a robot's crate/task/ledger association later. The new record appears in the action journal and every subsequent tick; the initial record stays in the header for deterministic replay. Agent and robot IDs never change during a hub session.

For a fourth robot, add its pose, initial crate and destination zone (or reuse an existing zone), then provide a fourth assignment. The same server and renderer handle the extra robot; the multi-view layout adds its FPV panel. The included scripted demo is the three-robot warehouse choreography; agents for another scenario choose their own waypoint/assignment schedule.

The seed is part of the recorded run identity. All geometry is explicit in this version; there is no random spawning or sensor noise to draw from it. Given the same scene, seed and actions, there is no dependency on system time or randomness in physics.

The optional assignment `driverLabel` (1–27 letters, digits, spaces, `/`, `_` or `-`) supplies the multiview caption. Live launch requires it. Use the actual driver name; manual/older records without it display `agentId`. Reset and assignment changes preserve the mapping.

Task and ledger IDs must match `[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}`. Controls, whitespace, bidi characters and markup are refused before they can enter observations or journals.

Scene names use ASCII letters, digits, spaces and `/_.:+-`; the original ` · ` title/subtitle separator remains supported. Studio overlay metadata contains only the normalized glyphs actually painted, with unsupported characters represented as spaces.

New runs cap each path plan at 50,000 deterministic arena/blocker checks, including line-of-sight simplification. Exhausting the budget rejects the command before mutation. The queue uses a cursor instead of repeated array shifts. Version-1 replay retains its original planning behavior.

The planner is intentionally incomplete under its work budget. In large valid scenes (for example, a 60×60 m arena with 32 racks and 32 crates), a reachable distant target can exceed 50,000 checks because every sampled point may test every blocker. A work-budget error does not mean the target is obstructed or unreachable. Choose nearer intermediate waypoints, simplify the scene, or use bounded drive commands with observations. The default warehouse fits this limit; support for larger schema-valid scenes does not promise that every `goto` succeeds.
