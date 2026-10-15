# Native Windows candidate — qualification pending

Sim 0.1.13 is a held candidate. Windows acceptance has not run: the authorized Windows host became unreachable before this product's native tests. Linux tests, PowerShell parsing and C# compilation are preparation evidence only. No Windows 10, Windows 11, Claude Code pane, Claude Desktop or Codex native installation is declared qualified.

The prepared runtime uses native Node.js 22+ and Windows PowerShell 5.1, with Windows installed at `C:\Windows`. No WSL, Python, MSYS or Cygwin runtime is used. Node must be on the user's PATH. The pane chooses its OS launcher from the SDK's absolute plugin root before starting any program; ambiguous, UNC and mixed roots refuse. Its fixed native command is `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File native/windows-pane.ps1`, with the plugin root as its working directory and the request on stdin. A nonstandard Windows directory requires a separately reviewed launcher change.

## Held portable install route

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

Use a normal, non-elevated account and a private fixed local NTFS drive. From the installed program folder:

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

File reads open the Node descriptor first, inspect the named Windows file using `OPEN_REPARSE_POINT`, and bind exact 64-bit volume/file identity to that open descriptor before reading bytes. Private files require current-user ownership, private/nonwritable ACLs, disk-file type and one link. Scenario files may be readable by others but must remain current-user-owned and nonwritable by other accounts. Junctions/reparse points, UNC/device/ADS/drive-relative paths and hardlinked private files refuse. GetDriveTypeW must identify a fixed drive before opening a component, and GetVolumeInformationByHandleW must identify NTFS on every inspected handle, including existing ancestors before directory creation. Remote/mapped, removable, RAM and other filesystem volumes refuse without a fallback. Actual native rejection still requires proof. This is an OS-account boundary; agents with file/shell tools under the same account can still read that account's private files. SYSTEM and Administrators remain trusted.

The Windows pane clears inherited environment variables before Node starts. Its fixed child waits for nonempty input until the parent assigns a Job Object, then imports Sim. Closing the job kills that reader and its descendants. The wrapper bounds the child to 10 seconds; the pane bounds the wrapper to 12 seconds. Linux retains its pre-Node `env -i` scrub. API keys and `NODE_OPTIONS` are not forwarded. The request passes through stdin, never executable command text.

Linux UID/mode checks remain enforced. Windows history is bounded to 256 retained runs per read (4096 root entries overall); archive older runs deliberately before opening larger history. No run is automatically deleted. Existing exclusive hub locks remain fail-closed after a crash; verify the owning hub stopped and move the entire stale root aside before creating a new one. Ctrl+C and native console Ctrl+Break request graceful shutdown. Force termination can leave a stale lock and private connection files and is not equivalent to graceful cleanup.

Replay and capture remain explicit human CLI operations. Native Chromium/Edge discovery, sandboxing, rendering and hashes are unqualified; capture needs an explicitly supplied real Chromium binary and must not be tested in an owner's active browser. No capture, upload or publishing tool is exposed over MCP.

## Remaining native evidence

Run actual private creation/read and expanded raw-DACL/ancestor fixtures, volume/file-ID binding, Unicode/CRLF, hardlink/junction refusal, exclusive lock and interrupted-start cleanup, real stdio init/catalog/call/EOF, both physics engines, install/hash/tamper/no-overwrite checks and actual inherited ACL/current-owner checks on the installed files and Windows pane Job Object cleanup from a fresh folder. Measure the helper/pane deadlines at the stated history bound. Prove a normal-user token, then have a different worker follow only these docs. Windows 11 is untested; a separate native run is needed before claiming its qualification. GUI/client checks requiring the console and any signing are owner-pending and do not block CLI/MCP readiness once all other required gates pass. Retain receipts and do not promote this document's prepared commands to tested claims without those results.
