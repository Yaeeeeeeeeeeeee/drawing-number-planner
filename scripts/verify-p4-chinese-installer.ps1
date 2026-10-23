param([Parameter(Mandatory=$true)][string]$SetupPath, [Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
# Inno VCL controls can appear as UIA Pane instead of Edit/Button. Use their
# genuine HWND/class and Win32 edit messages, never a fabricated UI fixture.
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class InstallerNative {
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
 [DllImport("user32.dll", EntryPoint="SendMessageW", CharSet=CharSet.Unicode)] public static extern IntPtr ReadText(IntPtr hwnd, uint message, IntPtr count, StringBuilder text);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wparam, string lparam);
 [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLong(IntPtr hwnd, int index);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr hwnd, int id);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
}
'@
function NativeClass($element) {
 $buffer=New-Object System.Text.StringBuilder 256
 [void][InstallerNative]::GetClassName([IntPtr]$element.Current.NativeWindowHandle,$buffer,$buffer.Capacity)
 return $buffer.ToString()
}
function Read-Directory($handle) {
  $text=New-Object System.Text.StringBuilder 2048
  [void][InstallerNative]::ReadText($handle,0x000D,[IntPtr]$text.Capacity,$text)
  return $text.ToString()
}
function Click-WizardButton($pattern) {
  $button=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -match $pattern -and (NativeClass $_) -match 'Button' -and $_.Current.IsEnabled -and !$_.Current.IsOffscreen } | Select-Object -First 1
  if (!$button) { throw "Wizard button missing: $pattern" }
  # Post instead of Send: opening a modal dialog blocks the original handler.
  [void][InstallerNative]::PostMessage([IntPtr]$button.Current.NativeWindowHandle,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero)
}
function Select-ShellFolder($path,$expected) {
  Click-WizardButton '浏览'
  $dialog=$null
  for ($attempt=0;$attempt -lt 60;$attempt++) {
    $dialog=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.ProcessId -eq $window.Current.ProcessId -and (NativeClass $_) -eq '#32770' } | Select-Object -First 1
    if ($dialog) { break }
    Start-Sleep -Milliseconds 250
  }
  if (!$dialog) { throw 'Windows shell folder picker did not open (the old drive-only picker is unsupported)' }
  $dialogHandle=[IntPtr]$dialog.Current.NativeWindowHandle
  # BFFM_SETSELECTIONW selects the genuine Shell tree item and resolves its PIDL.
  [void][InstallerNative]::SendMessage($dialogHandle,0x0467,[IntPtr]1,$path)
  $okHandle=[InstallerNative]::GetDlgItem($dialogHandle,1)
  if ($okHandle -eq [IntPtr]::Zero) { throw 'Shell folder picker OK button missing' }
  [void][InstallerNative]::PostMessage($okHandle,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero)
  for ($attempt=0;$attempt -lt 60;$attempt++) {
    if ((Read-Directory $editHandle) -eq $expected) { return }
    Start-Sleep -Milliseconds 250
  }
  throw "Shell folder selection mismatch: $(Read-Directory $editHandle); expected $expected"
}
function Assert-ReadyDirectory($expected) {
  Click-WizardButton '下一步'
  for ($attempt=0;$attempt -lt 60;$attempt++) {
    # Existing directories trigger Inno's normal confirmation. Accept only the
    # confirmation belonging to this isolated wizard.
    $dialogs=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.ProcessId -eq $window.Current.ProcessId -and $_.Current.NativeWindowHandle -ne $window.Current.NativeWindowHandle }
    foreach ($dialog in $dialogs) {
      $yes=$dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -match '^是' -and (NativeClass $_) -match 'Button' } | Select-Object -First 1
      if ($yes) { [void][InstallerNative]::PostMessage([IntPtr]$yes.Current.NativeWindowHandle,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero) }
    }
    $elements=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
    $install=$elements | Where-Object { $_.Current.Name -match '^安装' -and (NativeClass $_) -match 'Button' -and !$_.Current.IsOffscreen } | Select-Object -First 1
    if ($install) {
      $memo=$elements | Where-Object { (NativeClass $_) -match 'Memo' -and !$_.Current.IsOffscreen } | Select-Object -First 1
      if (!$memo -or (Read-Directory ([IntPtr]$memo.Current.NativeWindowHandle)) -notlike "*$expected*") { throw 'Ready page does not retain selected directory' }
      return
    }
    Start-Sleep -Milliseconds 250
  }
  throw 'Selected Desktop directory did not advance to the ready page'
}
$setup = (Resolve-Path $SetupPath).Path
Start-Process $setup -ArgumentList @('/SP-', '/NORESTART') | Out-Null
$root = [System.Windows.Automation.AutomationElement]::RootElement
$window = $null
for ($attempt=0; $attempt -lt 60; $attempt++) {
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($candidate in $windows) {
    if ($candidate.Current.Name -like '*图号规划器*' -and $candidate.Current.Name -match '安装') { $window=$candidate; break }
  }
  if ($window) { break }
  Start-Sleep -Milliseconds 500
}
if (!$window) { throw 'Chinese installer window not found' }
try {
  $edit = $null
  $lastElements = @()
  $nextClicks = 0
  # Inno's bootstrap exposes its top-level title before the actual wizard controls.
  # Wait for usable controls rather than treating the first empty tree as failure.
  for ($attempt=0; $attempt -lt 80; $attempt++) {
    $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $lastElements = @($elements | ForEach-Object { @{ name=$_.Current.Name; type=$_.Current.ControlType.ProgrammaticName; enabled=$_.Current.IsEnabled } })
    foreach ($element in $elements) {
      if ($element.Current.Name -match 'DrawingNumberPlanner|图号规划器' -and (NativeClass $element) -match 'Edit') { $edit=$element; break }
    }
    if ($edit) { break }
    $next = $elements | Where-Object { $_.Current.Name -match '下一步' -and (NativeClass $_) -match 'Button' -and $_.Current.IsEnabled } | Select-Object -First 1
    if ($next -and $nextClicks -lt 3) {
      [void][InstallerNative]::SendMessage([IntPtr]$next.Current.NativeWindowHandle,0x00F5,[IntPtr]::Zero,$null)
      $nextClicks++
    }
    Start-Sleep -Milliseconds 500
  }
  if (!$edit) { $lastElements | ConvertTo-Json -Depth 3 | Write-Output; throw 'Selectable installation directory edit not found after waiting for controls' }
  $desktop=[Environment]::GetFolderPath('DesktopDirectory')
  if (!$desktop) { throw 'Physical Desktop directory unavailable' }
  $custom=Join-Path $desktop ('中文安装路径-人工可选-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory $custom | Out-Null
  $editHandle=[IntPtr]$edit.Current.NativeWindowHandle
  if (([InstallerNative]::GetWindowLong($editHandle,-16) -band 0x0800) -ne 0) { throw 'Directory cannot be edited' }
  [void][InstallerNative]::SendMessage($editHandle,0x000C,[IntPtr]::Zero,$custom)
  $selected=New-Object System.Text.StringBuilder 1024
  # GetWindowText cannot read another process's edit contents. WM_GETTEXT is
  # marshalled by Windows for this genuine cross-process control readback.
  [void][InstallerNative]::ReadText($editHandle,0x000D,[IntPtr]$selected.Capacity,$selected)
  if ($selected.ToString() -ne $custom) { throw ('Custom directory did not remain selected: ' + $selected.ToString()) }
  $names = @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { $_.Current.Name })
  if (!($names | Where-Object { $_ -match '浏览|目标位置|选择安装|安装位置' })) { throw 'Chinese directory labels not found' }
  Select-ShellFolder $desktop (Join-Path $desktop 'DrawingNumberPlanner')
  Assert-ReadyDirectory (Join-Path $desktop 'DrawingNumberPlanner')
  Click-WizardButton '上一步'
  Start-Sleep -Milliseconds 300
  [void][InstallerNative]::SendMessage($editHandle,0x000C,[IntPtr]::Zero,($desktop.ToUpperInvariant() + '\'))
  Assert-ReadyDirectory (Join-Path $desktop 'DrawingNumberPlanner')
  Click-WizardButton '上一步'
  Start-Sleep -Milliseconds 300
  Select-ShellFolder $custom $custom
  Assert-ReadyDirectory $custom
  New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
  $bounds=$window.Current.BoundingRectangle
  $bitmap=New-Object System.Drawing.Bitmap ([int]$bounds.Width),([int]$bounds.Height)
  $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
  try { $graphics.CopyFromScreen([int]$bounds.X,[int]$bounds.Y,0,0,$bitmap.Size); $bitmap.Save((Join-Path $OutputDirectory 'Windows-中文安装向导-自选路径.png'),[System.Drawing.Imaging.ImageFormat]::Png) }
  finally { $graphics.Dispose(); $bitmap.Dispose() }
  @{ language='简体中文'; directoryEditable=$true; shellFolderPicker=$true; desktopRootRedirected=$true; typedDesktopRootRedirected=$true; advancedToReady=$true; chosenDirectory=$custom; title=$window.Current.Name; installedByThisProbe=$false } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $OutputDirectory 'windows-chinese-installer.json')
} finally {
  # Probe does not install; terminate only the isolated Inno wizard process.
  $wizardPid = $window.Current.ProcessId
  if ($wizardPid) { Stop-Process -Id $wizardPid -Force -ErrorAction SilentlyContinue }
  if ($custom -and (Test-Path -LiteralPath $custom)) { Remove-Item -LiteralPath $custom }
}
