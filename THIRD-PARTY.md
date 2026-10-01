# Bundled dependencies

The offline distribution includes the complete pinned JavaScript/WASM package contents below, including upstream license files. No npm install or browser download occurs at startup.

| Package | Version | License | Bundled location |
| --- | --- | --- | --- |
| @dimforge/rapier3d-compat | 0.17.3 | Apache-2.0 | licenses/Apache-2.0.txt (the upstream tarball declares Apache-2.0 but omits a license file) |
| three | 0.180.0 | MIT | node_modules/three/LICENSE |
| playwright-core | 1.62.0 | Apache-2.0 | node_modules/playwright-core/LICENSE, NOTICE, ThirdPartyNotices.txt |

`package-lock.json` records the registry tarball integrity values used for offline installation. The supplied npm cache is a build input; the release archive contains installed packages. The portable Chromium binary and its libraries are a separately supplied rendering runtime, with their own upstream notices. Capture records its exact binary hash/version. Node.js and Chromium are not redistributed in the Sim archive.
