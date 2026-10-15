$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$child=$null; $job=$null
try {
  $request=[Console]::In.ReadToEnd()
  if ([Text.Encoding]::UTF8.GetByteCount($request) -gt 65536) { throw 'Request too large' }
  $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $node=(Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  if (!$node -or ![IO.File]::Exists($node)) { throw 'Node missing' }
  Add-Type -Path (Join-Path $PSScriptRoot 'windows-job.cs')
  $job=New-Object SimPaneJob
  $start=New-Object Diagnostics.ProcessStartInfo
  $start.FileName=$node
  $start.Arguments='"'+(Join-Path $PSScriptRoot 'windows-pane-child.mjs')+'"'
  $start.WorkingDirectory=$root
  $start.UseShellExecute=$false; $start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
  $start.StandardOutputEncoding=New-Object Text.UTF8Encoding($false)
  $start.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
  $start.EnvironmentVariables.Clear()
  foreach ($name in @('SystemRoot','WINDIR')) { $start.EnvironmentVariables[$name]=[Environment]::GetEnvironmentVariable('SystemRoot') }
  $start.EnvironmentVariables['USERPROFILE']=[Environment]::GetFolderPath('UserProfile')
  $start.EnvironmentVariables['LOCALAPPDATA']=[Environment]::GetFolderPath('LocalApplicationData')
  foreach ($name in @('TEMP','TMP')) { $start.EnvironmentVariables[$name]=[IO.Path]::GetTempPath() }
  $start.EnvironmentVariables['PATH']=[IO.Path]::GetDirectoryName($node)
  $start.EnvironmentVariables['LANG']='C.UTF-8'
  # The fixed child waits for stdin before importing Sim or starting helpers.
  # Assign its job first, then release the request. Closing this job kills only
  # this child and its descendants, including a timed-out ACL helper.
  $child=[Diagnostics.Process]::Start($start)
  $job.Assign($child.Handle)
  $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
  $child.StandardInput.Write($request);$child.StandardInput.Close()
  if (!$child.WaitForExit(10000)) { throw 'Reader timed out' }
  $out=$stdout.GetAwaiter().GetResult();$err=$stderr.GetAwaiter().GetResult()
  if ([Text.Encoding]::UTF8.GetByteCount($out) -gt 65536 -or [Text.Encoding]::UTF8.GetByteCount($err) -gt 65536) { throw 'Reader output too large' }
  [Console]::Out.Write($out);[Console]::Error.Write($err)
  $code=$child.ExitCode
} catch { [Console]::Error.WriteLine('Native Sim pane reader unavailable.');$code=1 }
finally { if($job){$job.Dispose()};if($child){if(!$child.HasExited){$child.Kill()};$child.Dispose()} }
exit $code
