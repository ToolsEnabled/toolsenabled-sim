param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][ValidateSet('Grant','Remove','Describe')][string]$Action,[string]$Rights='Read')
$ErrorActionPreference='Stop'
$item=Get-Item -LiteralPath $Path -Force
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Fixture links refused' }
$acl=Get-Acl -LiteralPath $Path
$everyone=New-Object Security.Principal.SecurityIdentifier('S-1-1-0')
if($Action -ceq 'Grant') {
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($everyone,[Security.AccessControl.FileSystemRights]::$Rights,[Security.AccessControl.AccessControlType]::Allow)
  $null=$acl.AddAccessRule($rule);Set-Acl -LiteralPath $Path -AclObject $acl
} elseif($Action -ceq 'Remove') {
  foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.IdentityReference.Value -ceq $everyone.Value){$null=$acl.RemoveAccessRuleSpecific($rule)}}
  Set-Acl -LiteralPath $Path -AclObject $acl
}
(Get-Acl -LiteralPath $Path).Sddl
