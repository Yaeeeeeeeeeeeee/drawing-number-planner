param(
  [Parameter(Mandatory=$true)][string]$SetupPath,
  [Parameter(Mandatory=$true)][string]$PackageRoot,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
# These installs belong on an ephemeral Windows Actions desktop, never a user's.
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run Desktop installation verification only on the disposable Windows Actions runner' }
$setup=(Resolve-Path $SetupPath).Path
$package=(Resolve-Path $PackageRoot).Path
$desktop=[Environment]::GetFolderPath('DesktopDirectory')
if (!$desktop) { throw 'Physical Desktop directory unavailable' }
New-Item -ItemType Directory -Force $desktop | Out-Null
$child=Join-Path $desktop ('中文安装目录-' + [Guid]::NewGuid().ToString('N'))
$rootTarget=Join-Path $desktop 'DrawingNumberPlanner'
if (Test-Path -LiteralPath $rootTarget) { throw 'Desktop root test requires a fresh dedicated application directory' }
$sentinel=Join-Path $desktop '图号规划器.exe'
$createdSentinel=!(Test-Path -LiteralPath $sentinel)
if ($createdSentinel) { Set-Content -LiteralPath $sentinel -Value 'Existing Desktop file must not be overwritten' }
$desktopHash=(Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash
$personal=Join-Path $child '业务资料/planner.db'
New-Item -ItemType Directory -Force (Split-Path $personal) | Out-Null
Set-Content -LiteralPath $personal -Value 'Existing personal database must remain unchanged'
$personalHash=(Get-FileHash -LiteralPath $personal -Algorithm SHA256).Hash
function Install-AndCompare($requested,$expected,$logName) {
  $log=Join-Path (Resolve-Path $OutputDirectory).Path $logName
  $process=Start-Process $setup -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/DIR=`"$requested`"","/LOG=`"$log`"") -PassThru
  if (!$process.WaitForExit(120000)) { $process.Kill(); throw 'Desktop install timed out' }
  if ($process.ExitCode -ne 0) { throw "Desktop install failed: $($process.ExitCode)" }
  $count=0
  Get-ChildItem $package -File -Recurse -Force | ForEach-Object {
    $relative=[IO.Path]::GetRelativePath($package,$_.FullName)
    $target=Join-Path $expected $relative
    if (!(Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) { throw "Desktop installed hash mismatch: $relative" }
    $count++
  }
  if ((Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash -ne $desktopHash) { throw 'Desktop root file was overwritten' }
  if ((Get-FileHash -LiteralPath $personal -Algorithm SHA256).Hash -ne $personalHash) { throw 'Existing personal data was modified' }
  return @{ requested=$requested; installed=$expected; verifiedFiles=$count }
}
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
try {
  $childResult=Install-AndCompare $child $child 'desktop-chinese-child-install.txt'
  # Case variations must still identify the physical root. The interactive
  # verifier also covers a trailing slash without command-line quote ambiguity.
  $rootResult=Install-AndCompare $desktop.ToUpperInvariant() $rootTarget 'desktop-root-install.txt'
  @{ chineseChild=$childResult; desktopRoot=$rootResult; desktopFilePreserved=$true; personalDataPreserved=$true } | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $OutputDirectory 'windows-desktop-install.json')
} finally {
  if ($createdSentinel) { Remove-Item -LiteralPath $sentinel }
}
# Keep installed directories for the workflow's real installed-EXE verification.
