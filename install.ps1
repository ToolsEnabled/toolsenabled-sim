param([string]$Destination = '')
$ErrorActionPreference = 'Stop'
if (!$Destination) { $Destination = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ToolsEnabled\Sim\0.1.13' }
$root = [IO.Path]::GetFullPath($PSScriptRoot)
$manifestPath = Join-Path $root 'tools\install-files.json'
$entries = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
function Verify-File([string]$base,[string]$relative,[string]$expected) {
  if ($relative -notmatch '^[A-Za-z0-9@._/-]+$' -or $relative.Split('/') -contains '..' -or $expected -notmatch '^[a-f0-9]{64}$') { throw 'Invalid installation inventory' }
  $file = [IO.Path]::GetFullPath((Join-Path $base $relative))
  if (!$file.StartsWith($base.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid installation path' }
  $part=$file
  while($part -and $part.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)) {
    if (([IO.File]::GetAttributes($part) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Installation links are refused' }
    if($part -ceq $base){break};$part=[IO.Path]::GetDirectoryName($part)
  }
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected) { throw 'Installation checksum mismatch' }
}
if (!$entries -or @($entries.PSObject.Properties).Count -gt 512) { throw 'Invalid installation inventory' }
foreach($entry in $entries.PSObject.Properties){ Verify-File $root $entry.Name $entry.Value }
# Validate original spelling before any GetFullPath normalization.
$localSpelling=$Destination.Replace('/', '\')
if ($localSpelling -notmatch '^[A-Za-z]:\\' -or $localSpelling.Substring(2).Contains(':')) { throw 'Use an absolute local drive destination' }
foreach($part in $localSpelling.Substring(3).Split('\',[StringSplitOptions]::RemoveEmptyEntries)){if($part -in @('.','..') -or $part -match '[<>"|?*\x00-\x1f]' -or $part -match '[. ]$' -or $part -match '^(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)'){throw 'Unsupported destination component'}}
$destinationFull=[IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $destinationFull) { throw 'Choose a new installation directory; existing data is never overwritten' }
# Create a private destination using the same all-ancestor/raw-DACL policy as runtime state.
$request=@{operation='create-directory';paths=@($Destination);exclusive=$true}|ConvertTo-Json -Compress
$request | & (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $root 'native\windows-private-files.ps1') | Out-Null
if($LASTEXITCODE -ne 0){throw 'Private installation directory refused'}
foreach($entry in $entries.PSObject.Properties){
  $target=Join-Path $destinationFull $entry.Name
  $null=[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
  $inputFile=[IO.File]::OpenRead((Join-Path $root $entry.Name))
  try{$outputFile=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$inputFile.CopyTo($outputFile)}finally{$outputFile.Dispose()}}finally{$inputFile.Dispose()}
}
$inputFile=[IO.File]::OpenRead($manifestPath)
try{$outputFile=[IO.File]::Open((Join-Path $destinationFull 'tools\install-files.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$inputFile.CopyTo($outputFile)}finally{$outputFile.Dispose()}}finally{$inputFile.Dispose()}
foreach($entry in $entries.PSObject.Properties){ Verify-File $destinationFull $entry.Name $entry.Value }
Write-Output ('Installed portable Sim 0.1.13: '+$destinationFull)
Write-Output 'No client settings were changed. Follow docs/WINDOWS.md for hub and client setup.'
