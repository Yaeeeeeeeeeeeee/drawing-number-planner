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
using System.Collections.Generic;
public class InstallerWindow {
 public long handle; public long owner; public int pid; public string title; public string nativeClass; public bool visible;
}
public static class InstallerNative {
 public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lparam);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
 [DllImport("user32.dll", EntryPoint="SendMessageW", CharSet=CharSet.Unicode)] public static extern IntPtr ReadText(IntPtr hwnd, uint message, IntPtr count, StringBuilder text);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wparam, string lparam);
 [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLong(IntPtr hwnd, int index);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr hwnd, int id);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lparam);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hwnd, EnumWindowsProc callback, IntPtr lparam);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
 [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hwnd, out int pid);
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint command);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
 public static InstallerWindow Describe(IntPtr hwnd) {
  var title=new StringBuilder(2048); var cls=new StringBuilder(256); int pid;
  GetWindowText(hwnd,title,title.Capacity); GetClassName(hwnd,cls,cls.Capacity); GetWindowThreadProcessId(hwnd,out pid);
  return new InstallerWindow { handle=hwnd.ToInt64(),owner=GetWindow(hwnd,4).ToInt64(),pid=pid,title=title.ToString(),nativeClass=cls.ToString(),visible=IsWindowVisible(hwnd) };
 }
 public static InstallerWindow[] Windows(IntPtr parent) {
  var result=new List<InstallerWindow>();
  EnumWindowsProc callback=(hwnd,lparam)=>{ result.Add(Describe(hwnd)); return true; };
  if(parent==IntPtr.Zero) EnumWindows(callback,IntPtr.Zero); else EnumChildWindows(parent,callback,IntPtr.Zero);
  return result.ToArray();
 }
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
function Save-InstallerSnapshot($label) {
  $native=@([InstallerNative]::Windows([IntPtr]::Zero))
  $uia=@()
  foreach ($top in $native) {
    if (!$top.visible) { continue }
    try {
      $element=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$top.handle)
      $children=$element.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
      $uia+=@{ window=$top; elements=@($children | Select-Object -First 350 | ForEach-Object { @{ name=$_.Current.Name; id=$_.Current.AutomationId; class=NativeClass $_; pid=$_.Current.ProcessId; hwnd=$_.Current.NativeWindowHandle; visible=!$_.Current.IsOffscreen; enabled=$_.Current.IsEnabled; type=$_.Current.ControlType.ProgrammaticName } }); nativeChildren=@([InstallerNative]::Windows([IntPtr]$top.handle) | Where-Object visible) }
    } catch { $uia+=@{ window=$top; error=$_.Exception.Message } }
  }
  @{ label=$label; innoVersion=$innoVersion; topWindows=$native; windows=$uia } | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 (Join-Path $OutputDirectory "$label-windows.json")
  $native | ConvertTo-Json -Depth 3 | Write-Output
  $bounds=[System.Windows.Forms.SystemInformation]::VirtualScreen
  $bitmap=New-Object System.Drawing.Bitmap $bounds.Width,$bounds.Height
  $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
  try { $graphics.CopyFromScreen($bounds.Location,[System.Drawing.Point]::Empty,$bounds.Size); $bitmap.Save((Join-Path $OutputDirectory "$label-desktop.png"),[System.Drawing.Imaging.ImageFormat]::Png) }
  finally { $graphics.Dispose(); $bitmap.Dispose() }
}
function Click-NativeButton($button) {
  $bounds=$button.Current.BoundingRectangle
  if (!$button.Current.IsEnabled -or $button.Current.IsOffscreen -or $bounds.IsEmpty) { throw 'Native button is not visible and enabled' }
  Write-Output "Clicking actual button: $($button.Current.Name), HWND=$($button.Current.NativeWindowHandle), class=$(NativeClass $button)"
  # BM_CLICK is documented to fail on an inactive dialog. Use a real mouse click
  # on the verified HWND's visible UIA bounds, including modal folder dialogs.
  [System.Windows.Forms.Cursor]::Position=New-Object System.Drawing.Point ([int]($bounds.X+$bounds.Width/2)),([int]($bounds.Y+$bounds.Height/2))
  [InstallerNative]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)
  [InstallerNative]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
}
function Click-WizardButton($pattern) {
  $button=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -match $pattern -and (NativeClass $_) -match 'Button' -and $_.Current.IsEnabled -and !$_.Current.IsOffscreen } | Select-Object -First 1
  if (!$button) { throw "Wizard button missing: $pattern" }
  [void][InstallerNative]::SetForegroundWindow([IntPtr]$window.Current.NativeWindowHandle)
  Click-NativeButton $button
}
function Select-ShellFolder($path,$expected) {
  Save-InstallerSnapshot ('before-folder-picker-' + $script:pickerCount)
  Click-WizardButton '浏览'
  $dialog=$null
  for ($attempt=0;$attempt -lt 60;$attempt++) {
    # Owned dialogs can appear below their owner in UIA. EnumWindows enumerates
    # actual top-level HWNDs independently of that accessibility hierarchy.
    $nativeDialog=[InstallerNative]::Windows([IntPtr]::Zero) | Where-Object { $_.visible -and $_.title -eq '选择安装文件夹（可以选择桌面上的文件夹）' } | Select-Object -First 1
    if ($nativeDialog) { $dialog=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$nativeDialog.handle) }
    if ($dialog) { break }
    Start-Sleep -Milliseconds 250
  }
  if (!$dialog) { throw 'Windows shell folder picker HWND was not found; see captured native/UIA window trees and screenshot' }
  Save-InstallerSnapshot ('folder-picker-' + $script:pickerCount)
  $script:pickerCount++
  $dialogHandle=[IntPtr]$dialog.Current.NativeWindowHandle
  # Inno 6.7.1 uses IFileDialog/FOS_PICKFOLDERS, not SHBrowseForFolder.
  # Saved runner evidence identifies the genuine filename HWND as id 1152,
  # native class Edit, while UIA incorrectly reports ControlType.Pane.
  $folderEditHandle=[IntPtr]::Zero
  for ($attempt=0;$attempt -lt 40;$attempt++) {
    $folderEditHandle=[InstallerNative]::GetDlgItem($dialogHandle,1152)
    if ($folderEditHandle -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 250
  }
  if ($folderEditHandle -eq [IntPtr]::Zero -or [InstallerNative]::Describe($folderEditHandle).nativeClass -ne 'Edit') { throw 'Verified Shell folder-name Edit HWND (id 1152) missing; see captured picker controls' }
  [void][InstallerNative]::SendMessage($folderEditHandle,0x000C,[IntPtr]::Zero,$path)
  if ((Read-Directory $folderEditHandle) -ne $path) { throw 'Shell folder-name Edit did not retain the requested physical directory' }
  $okHandle=[InstallerNative]::GetDlgItem($dialogHandle,1)
  if ($okHandle -eq [IntPtr]::Zero -or [InstallerNative]::Describe($okHandle).nativeClass -ne 'Button') { throw 'Verified Shell Select Folder Button HWND (id 1) missing' }
  $ok=[System.Windows.Automation.AutomationElement]::FromHandle($okHandle)
  Click-NativeButton $ok
  # A common dialog may first navigate into the typed folder. If it remains
  # open, Select Folder now confirms that directory; the returned path is still
  # checked against the independently specified expected target below.
  Start-Sleep -Milliseconds 500
  if ([InstallerNative]::IsWindowVisible($dialogHandle)) { Click-NativeButton $ok }
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
    $dialogs=[InstallerNative]::Windows([IntPtr]::Zero) | Where-Object { $_.visible -and $_.title -eq '文件夹已存在' -and ($_.owner -eq $window.Current.NativeWindowHandle -or $_.pid -eq $edit.Current.ProcessId) }
    foreach ($nativeDialog in $dialogs) {
      # Runner evidence shows the system MessageBox uses English Yes/No even
      # when its prompt is Chinese. IDYES (6) identifies the actual button.
      $yesHandle=[InstallerNative]::GetDlgItem([IntPtr]$nativeDialog.handle,6)
      if ($yesHandle -eq [IntPtr]::Zero -or [InstallerNative]::Describe($yesHandle).nativeClass -ne 'Button') { throw 'Verified existing-folder confirmation IDYES Button HWND missing' }
      Click-NativeButton ([System.Windows.Automation.AutomationElement]::FromHandle($yesHandle))
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
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$OutputDirectory=(Resolve-Path $OutputDirectory).Path
$innoCompiler=Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6/ISCC.exe'
$innoVersion=if (Test-Path $innoCompiler) { (Get-Item $innoCompiler).VersionInfo.FileVersion } else { 'not found' }
$script:pickerCount=0
$log=Join-Path $OutputDirectory 'windows-chinese-installer-log.txt'
$root = [System.Windows.Automation.AutomationElement]::RootElement
$window = $null
try {
Start-Process $setup -ArgumentList @('/SP-', '/NORESTART',"/LOG=`"$log`"") | Out-Null
for ($attempt=0; $attempt -lt 60; $attempt++) {
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($candidate in $windows) {
    if ($candidate.Current.Name -like '*图号规划器*' -and $candidate.Current.Name -match '安装') { $window=$candidate; break }
  }
  if ($window) { break }
  Start-Sleep -Milliseconds 500
}
if (!$window) { throw 'Chinese installer window not found' }
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
} catch {
  $originalError=$_
  try { Save-InstallerSnapshot 'installer-failure' } catch { Write-Warning "Snapshot failed: $_" }
  throw $originalError
} finally {
  # Probe does not install; terminate only the isolated Inno wizard process.
  $wizardPid = if ($window) { $window.Current.ProcessId } else { $null }
  if ($wizardPid) { Stop-Process -Id $wizardPid -Force -ErrorAction SilentlyContinue }
  if ($custom -and (Test-Path -LiteralPath $custom)) { Remove-Item -LiteralPath $custom }
}
