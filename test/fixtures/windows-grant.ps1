param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][ValidateSet('Grant','Remove','Describe')][string]$Action,[string]$Rights='Read')
$ErrorActionPreference='Stop'
$item=Get-Item -LiteralPath $Path -Force
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Fixture links refused' }
# Read/write only the fixture's DACL. Set-Acl can request SACL privileges on
# directories in Windows PowerShell5.1; ordinary-user tests must not need them.
$sections=[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner
function Read-FixtureAcl {
  if($item.PSIsContainer){return [IO.Directory]::GetAccessControl($Path,$sections)}
  return [IO.File]::GetAccessControl($Path,$sections)
}
function Write-FixtureAcl($security) {
  if($item.PSIsContainer){[IO.Directory]::SetAccessControl($Path,$security)}
  else{[IO.File]::SetAccessControl($Path,$security)}
}
$acl=Read-FixtureAcl
$everyone=New-Object Security.Principal.SecurityIdentifier('S-1-1-0')
if($Action -ceq 'Grant') {
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($everyone,[Security.AccessControl.FileSystemRights]::$Rights,[Security.AccessControl.AccessControlType]::Allow)
  $null=$acl.AddAccessRule($rule);Write-FixtureAcl $acl
} elseif($Action -ceq 'Remove') {
  foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.IdentityReference.Value -ceq $everyone.Value){$null=$acl.RemoveAccessRuleSpecific($rule)}}
  Write-FixtureAcl $acl
}
(Read-FixtureAcl).GetSecurityDescriptorSddlForm($sections)
