# Recording, cameras and deterministic capture

## Run files

The hub owns one append-only `trajectory.jsonl` and `actions.jsonl` in each `run-NNNN` directory. Files are created exclusively, never opened with truncation. Reset and scenario change allocate the next unused directory. `scenario.json` and `work-record.json` preserve initial inputs. Run directories use owner-only creation modes on POSIX.

The trajectory begins with a header containing schema version, scene, seed, engine version, timestep, initial assignments and tick budget. It then has state at tick 0 and after every 1/60-second physics step. State includes every robot pose, heading, driving agent ID, Fleet task and ledger IDs, active action, held crate, crate pose/delivery state, contacts, accepted command events and score. `events` contains commands since the previous tick; subsequent ticks in a batch have an empty event list. The action journal also preserves accepted trailing commands that have not yet been stepped.

Each line is canonical JSON: object keys are sorted recursively, arrays preserve semantic order, and lines end in LF. Values are rounded to six decimal places in pose/time observations. Physics retains Rapier's internal precision. Each trajectory record has `previous` (the prior record's SHA-256, or 64 zeroes for the header) and `hash`, which is SHA-256 of the canonical record excluding its `hash` field. The chain detects changes and truncation only when checked against a separately retained terminal hash; it is not a signature or authenticity claim.

Every accepted mutation appears in the action journal with contiguous `order`, current `tick`, bound `identity`, tool name and validated arguments. `node tools/replay.mjs RUN` validates the trajectory chain, instantiates fresh Rapier physics, executes each action at its recorded tick and compares the complete output bytes. It refuses reordered actions, tick discontinuities, bad hashes and differing physics. Wall-clock times, client connection capabilities and filesystem paths are absent from deterministic logs.

Use **Sim 0.1.1 or later** to verify 0.1.x recordings with the new `budgetPolicy` header. The 0.1.0 verifier rejects these recordings with `Physics replay differs`, even though the header's schema version is still 2. Sim 0.1.1 continues to replay older recordings byte-identically.

A completed scripted run contains 600 simulated steps, 601 state records and one header. It covers ten seconds. The 300-frame sample uses times `i / 30` for `i = 0…299` (0 through 9.966666… seconds); its playback duration at 30 fps is ten seconds.

## Page capture hook

The capture script serves the allowlisted renderer and verified trajectory on an ephemeral loopback port. The page sets `window.ready = true` when loaded and exposes:

```js
window.renderAt(t, 'multiview');  // defaults to the combined view
window.render(t, 'overview');   // alias
window.simCameras;              // named individual cameras
window.cameraMetadata;         // dimensions, intrinsics and pose conventions
```

`renderAt` accepts a finite time in the closed recorded interval. It sets all object transforms from that time, then renders. Positions interpolate linearly between adjacent ticks; headings interpolate along the shortest wrapped arc. Metadata, contacts, assignments and delivery state use the preceding fixed tick. There is no animation loop or wall-clock sample. Calling `renderAt(5)`, `renderAt(1)`, and `renderAt(5)` produces identical first and third frames in the pinned runtime. The context has fixed 1080×1080 dimensions and pixel ratio 1; screenshot `canvas#output` or the whole 1080-square viewport after the returned promise resolves.

For a custom Studio capture pipeline, preserve the supplied browser binary/libraries, SwiftShader flags, viewport, device scale, color profile, shader source and embedded glyph code. Wait for `window.ready`, call `renderAt(frame / 30, camera)`, and capture one PNG. Do not advance physics in a browser callback. The built-in script is the reference adapter, including error checks, no external page requests, output RGB format, dimensions and SHA-256 manifest.

## Camera calibration

Scene units are metres. Three.js world `X` = simulation `x` (east), world `Y` = height, world `Z` = simulation `y` (south). Robot heading θ points along `(cos θ, 0, sin θ)`. Cameras use Three.js `lookAt`, with image right along local +X, image up along +Y, and optical forward along local −Z. Image pixel origin is top-left. Individual views are square, including the area beneath overlay labels.

All perspective cameras have vertical field of view 60°, near plane 0.05 m, far plane `max(100, 5 × max(arena.width, arena.depth))` m, no distortion, and principal point `(540, 540)`. With zoom 1, `fx = fy = 540 / tan(30°) = 935.307436…` pixels. Overview uses a scene-fitted zoom and off-axis projection to center the arena at 85% of the limiting frame dimension. Its exact zoom, view offset and projection matrix are in `cameraMetadata.overview`; for a square frame, `fx = 540 × projectionMatrix[0]`, `fy = 540 × projectionMatrix[5]`, `cx = 540 × (1 − projectionMatrix[8])`, `cy = 540 × (1 + projectionMatrix[9])`. The combined-view panels use their own aspect ratios and overlays; the square-camera calibration applies to individual output directories.

| Name | Extrinsics at time t | Projection |
| --- | --- | --- |
| `robot_<id>_fpv` | Position `(x, 1.8, y)`, look at `(x+4 cos θ, 1.8−4 tan(20°), y+4 sin θ)`, up `(0,1,0)` | Perspective, zoom 1 |
| `robot_<id>_chase` | Position `(x−3.4 cos θ, 3.3, y−3.4 sin θ)`, look at `(x+0.8 cos θ, 0.25, y+0.8 sin θ)`, up `(0,1,0)` | Perspective, zoom 1 |
| `overview` | Position `normalize(0.65,1,0.8) × 1.5 × max(arena.width, arena.depth)`, look at origin, up `(0,1,0)` | Perspective, fitted zoom and view offset |
| `overview_top` | Position `(0,22,0)`, look at origin, up `(0,0,−1)` | Orthographic square span `max(arena.width, arena.depth) + 2`; pixel scale `1080 / span` |

Use interpolated robot poses at the requested time in these formulas to recover the dynamic extrinsics. The FPV camera sits 1.8 m high with a 20° downward pitch; only the carried crate’s far top edge enters the bottom of the view. The overview fit is recomputed for each panel aspect ratio. The floor uses a subtle one-metre grid, fixed hemisphere/directional illumination and a deterministic 1024-square PCF soft shadow map. Zone labels project into upright screen-space badges; smaller panels use the first label token (normally A/B/C), while full views use the full zone label. No props were added. Every individual view and the combined frame has an embedded-glyph **SIMULATION** overlay independent of the selected camera or state. Zone labels and all other scene assets are local and generated from code; no system fonts or image assets are requested.

## Reproducibility envelope

Production npm pins are `@dimforge/rapier3d-compat@0.17.3`, `three@0.180.0`, and `playwright-core@1.62.0`. The compatibility physics package embeds WASM; its ESM file is imported explicitly because its package `main` has a CommonJS/ESM mismatch in Node 22. It emits one upstream initialization deprecation notice to stderr; this does not appear in MCP stdout or run bytes.

`capture-receipt.json` records every frame hash, exact times, all camera names, source trajectory hash, executable SHA-256, browser version, platform, launch flags, renderer and camera calibration. Keep the browser's bundled SwiftShader libraries with the executable. Frame byte identity is tested for repeated independent browser launches on the same environment. It is not claimed across browser, driver, platform or renderer changes.

No image encoding or wall-clock timestamp is inserted into the PNG bytes. Capture rejects a non-RGB PNG or any size other than 1080×1080. A fresh capture directory is required. `--verify-against` re-renders every selected frame, compares each raw-PNG SHA-256 with the first receipt, and stops at the first mismatch. Output from an interrupted capture is incomplete until a receipt is written.

## Studio adapter

To let an external Studio process capture the replay page, keep its read-only server running:

```sh
node src/replay-server.mjs --run ./runs/demo --port 0
```

The command prints the ephemeral loopback URL. This server has no mutation/capture/upload endpoint. The page marks `body[data-ready="1"]` and `window.ready` after its first frame. `renderAt(t)` and `render(t)` return promises after the synchronous draw; use `hook: "renderAt"` for the multi-view and `raster_metadata_hook: "studioRasterMetadata"`. Metadata declares the canvas region, visible overlay text and scene zone labels, with no private regions in this synthetic scene. A Studio composition must still supply matching source claims for its chosen on-screen text. Camera parameters can be passed directly to `renderAt(t, camera)` by a custom adapter.

The replay URL contains a per-launch capability. Every page, module and trajectory request requires it; other local accounts receive 401 without it. Keep that URL private. Referrer-Policy is no-referrer and X-Content-Type-Options is nosniff.

New runs reserve space before mutations/steps and cap their combined trajectory, action and live-audit logs at 128 MiB, below the 256 MiB verifier limit. Half the cap is split equally among robot command shares: a call that exceeds its robot's share returns `ROBOT_BYTE_BUDGET` without stopping peers. The first submission each tick and launcher holds use control space. Headers identify this policy as `robot-shares-v1`; headers without it replay using the original budget rules. If a mutation cannot fit the whole-run recording reservation, it returns `RUN_BYTE_BUDGET` and stops the run immediately, cancelling the live deadline. A journaled launcher `recording.stop` marks termination at the current boundary, preserving unstepped commands for replay. Hub-owned simulations stream records without retaining trajectory/action arrays in memory. Version-1 recordings use their original header and assignment-action schemas during verification/replay, including historical free-text names and work IDs, and retain their original bytes. New hubs always use the current restricted grammars; selecting a replay schema does not relax live input validation. Replay text still uses the renderer’s painted-glyph normalization.

Capture creates output directories with mode 0700 and PNG/receipt files with mode 0600 explicitly, even under an operator umask of 000.

Robot ordering uses the same explicit English-locale comparator in state creation, assignments, journal target lists, replay validation and live active/submitted lists. Mixed-case IDs and underscore/hyphen IDs follow the recorder’s established order.
