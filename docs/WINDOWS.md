# Native Windows

Sim 0.1.13 uses native Node.js and Windows PowerShell. The measured regression environment is Windows 10 Pro 22H2 build 19045, Node 22.14.0 and Windows PowerShell 5.1.19041.6456. Native installer/hash/inherited-file-DACL checks and four inert pane lifetime/environment/Unicode/EOF/deadline fixtures have run in elevated engineering and restricted medium contexts. Full release qualification is recorded separately and gates publication. Windows 11, real Claude Code/Codex client sessions, Claude Desktop and native browser capture are not established by those fixtures.

The prepared runtime uses native Node.js 22+ and Windows PowerShell 5.1, with Windows installed at `C:\Windows`. No WSL, Python, MSYS or Cygwin runtime is used. Node must be on the user's PATH. The pane chooses its OS launcher from the SDK's absolute plugin root before starting any program; ambiguous, UNC and mixed roots refuse. Its fixed native command is `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File native/windows-pane.ps1`, with the plugin root as its working directory and the request on stdin. A nonstandard Windows directory requires a separately reviewed launcher change.

## Portable install route

After the release lead publishes a qualified release, download its ZIP and SHA256 sidecar. From ordinary PowerShell, compare the archive hash before extraction:

```powershell
$expected = ((Get-Content .\toolsenabled-sim-0.1.13.zip.sha256 -Raw).Trim() -split '\s+')[0]
$actual = (Get-FileHash .\toolsenabled-sim-0.1.13.zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -cne $expected) { throw 'Archive checksum mismatch' }
Expand-Archive .\toolsenabled-sim-0.1.13.zip -DestinationPath .\sim-013
Set-Location .\sim-013\sim
.\install.cmd
```

The installer copies only the reviewed hash inventory to a new `%LOCALAPPDATA%\ToolsEnabled\Sim\0.1.13` directory. `install.cmd -Destination C:\Users\you\a-new-private-folder` chooses a new local destination. Existing destinations refuse; no files, client configuration or registry settings are overwritten. It creates a private per-user DACL before copying and verifies every copied file. A failed install leaves its own new folder for inspection; move that folder aside deliberately before retrying. Removal is an ordinary deliberate deletion of the chosen portable program folder after stopping its processes. Run state is separate and is never deleted by the installer.

Git installs contain the same reviewed dependency bytes as the ZIP. No npm install, lockfile resolver, downloaded browser or system package installation is requested. `node tools/package-inputs.mjs .` verifies the exact dependency inventory. `tools/upstream-npm-inputs.json` preserves original registry integrity provenance; it is not an install lockfile.

## Prepare a private hub and client

Use a normal, non-elevated terminal and a private fixed local NTFS drive. Elevated Node processes can create Administrators-owned files, which the strict current-user private-file rule correctly refuses. Do not change an existing owner or ACL to bypass a refusal. From the installed program folder:

```powershell
node .\src\hub-cli.mjs --root "$env:LOCALAPPDATA\ToolsEnabled\Sim\runs\manual-01"
```

Keep that terminal running. In another terminal, give the intended client only its own printed connection-file path. Print a native config without modifying any client settings:

```powershell
node .\tools\mcp-config.mjs --client codex --connection 'C:\Users\you\AppData\Local\ToolsEnabled\Sim\runs\manual-01\connection-amber.json'
$env:SIM_CONNECTION = 'C:\Users\you\AppData\Local\ToolsEnabled\Sim\runs\manual-01\connection-amber.json'
```

Then follow [CLAUDE-INSTALL.md](CLAUDE-INSTALL.md) or [COMMANDS.md](COMMANDS.md). Native agent GUI/pane acceptance remains an owner check; no owner's console session was used here. The Desktop bundle's compatibility declaration remains macOS-only until its separate native qualification.

## Safety and platform differences

Private directories require current-user ownership and a private DACL allowing only that user, SYSTEM and Administrators. Existing ACLs are inspected without repair. Every existing ancestor must have a trusted owner (current user, SYSTEM or Administrators) and must deny other accounts replacement, DACL/owner changes and attribute changes; normal read and sibling-creation grants alone do not grant replacement authority. Unknown, object and callback ACEs, null DACLs and unknown owners refuse. The exact measured NT SERVICE\TrustedInstaller SID (S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464) is accepted only as an existing ancestor owner. It receives no private-entry ownership or writer-grant exception; unknown service owners still refuse.

File reads open the Node descriptor first, inspect the named Windows file using `OPEN_REPARSE_POINT`, and bind exact 64-bit volume/file identity to that open descriptor before reading bytes. Private files require current-user ownership, private/nonwritable ACLs, disk-file type and one link. Scenario files may be readable by others but must remain current-user-owned and nonwritable by other accounts. Junctions/reparse points, UNC/device/ADS/drive-relative paths and hardlinked private files refuse. GetDriveTypeW must identify a fixed drive before opening a component, and GetVolumeInformationByHandleW must identify NTFS on every inspected handle, including existing ancestors before directory creation. Remote/mapped, removable, RAM and other filesystem volumes refuse without a fallback. The release evidence distinguishes implemented API checks from the volume and namespace cases actually exercised. This is an OS-account boundary; agents with file/shell tools under the same account can still read that account's private files. SYSTEM and Administrators remain trusted.

The Windows pane clears inherited environment variables before Node starts. Its fixed child waits for nonempty input until the parent assigns a Job Object, then imports Sim. Closing the job kills that reader and its descendants. The wrapper bounds the child to 10 seconds; the pane bounds the wrapper to 12 seconds. Linux retains its pre-Node `env -i` scrub. API keys and `NODE_OPTIONS` are not forwarded. The request passes through stdin, never executable command text.

Linux UID/mode checks remain enforced. Windows history is bounded to 256 retained runs per read (4096 root entries overall); archive older runs deliberately before opening larger history. No run is automatically deleted. Existing exclusive hub locks remain fail-closed after a crash; verify the owning hub stopped and move the entire stale root aside before creating a new one. Ctrl+C and native console Ctrl+Break request graceful shutdown. Force termination can leave a stale lock and private connection files and is not equivalent to graceful cleanup.

Replay and capture remain explicit human CLI operations. Native Chromium/Edge discovery, sandboxing, rendering and hashes are unqualified; capture needs an explicitly supplied real Chromium binary and must not be tested in an owner's active browser. No capture, upload or publishing tool is exposed over MCP.

## Release qualification and owner checks

Before publication, the release lead checks actual private creation/read and raw-DACL/ancestor fixtures, volume/file-ID binding, Unicode/CRLF, hardlink/junction refusal, exclusive lock and interrupted-start cleanup, real stdio init/catalog/call/EOF, both physics engines, install/hash/tamper/no-overwrite behavior, installed-file inherited ACLs/current ownership and pane Job cleanup from a fresh folder. Qualification also requires deadlines at the stated history bound, measured ordinary-user token evidence and a different worker following only the public docs. Parsing or compilation alone does not establish these behaviors. Windows 11 is untested; a separate native run is needed before claiming its qualification. GUI/client checks requiring the console and any signing are owner-pending and do not block CLI/MCP readiness once all other required gates pass. The release notes and qualification receipts record the exact tested source/archive and any open non-GUI gate.
