param([Parameter(Mandatory=$true)][ValidateSet('existing','fresh','qr','inspect')][string]$Mode,[string]$DatabasePath,[Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;using System.Text;using System.Runtime.InteropServices;
public static class ProfileDialogNative {
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd,StringBuilder value,int length);
 [DllImport("user32.dll",EntryPoint="SendMessageW",CharSet=CharSet.Unicode)] public static extern IntPtr WriteText(IntPtr hwnd,uint message,IntPtr wparam,string text);
 [DllImport("user32.dll",EntryPoint="SendMessageW",CharSet=CharSet.Unicode)] public static extern IntPtr ReadText(IntPtr hwnd,uint message,IntPtr length,StringBuilder text);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd,uint message,IntPtr wparam,IntPtr lparam);
}
'@
$root=[System.Windows.Automation.AutomationElement]::RootElement
$report=[ordered]@{mode=$Mode;database=$DatabasePath;stage='started';events=@();nativeMessageBox=$false;nativeFilePicker=$false}
function Save-Stage([string]$Stage) {
 $report.stage=$Stage;$report.events+=@{stage=$Stage;at=[DateTime]::UtcNow.ToString('o')}
 $report|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $ReportPath -Encoding utf8
 Write-Output (ConvertTo-Json -Compress -Depth 6 @{nativeDialogStage=$Stage;mode=$Mode;at=[DateTime]::UtcNow.ToString('o');matchedWindow=$report.matchedWindow;matchedControl=$report.matchedControl;filenameWriteMethod=$report.filenameWriteMethod;filenameCandidates=$report.filenameCandidates;openCandidates=$report.openCandidates;filenameReadBack=$report.filenameReadBack})
}
function Native-Class($Element) {
 $value=New-Object System.Text.StringBuilder 256
 [void][ProfileDialogNative]::GetClassName([IntPtr]$Element.Current.NativeWindowHandle,$value,$value.Capacity)
 return $value.ToString()
}
function Save-Diagnostics {
 $windows=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
 $report.windows=@(foreach($window in $windows){try{
  $elements=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
  @{name=$window.Current.Name;processId=$window.Current.ProcessId;handle=$window.Current.NativeWindowHandle;controls=@($elements|Select-Object -First 120|ForEach-Object{@{name=$_.Current.Name;id=$_.Current.AutomationId;type=$_.Current.ControlType.ProgrammaticName;nativeClass=(Native-Class $_);handle=$_.Current.NativeWindowHandle}})}
 }catch{@{diagnosticError=$_.Exception.Message}}})
 $report.processes=@(Get-Process|Where-Object{$_.MainWindowHandle -ne 0 -or $_.ProcessName -match 'planner|图号|electron'}|ForEach-Object{@{id=$_.Id;name=$_.ProcessName;title=$_.MainWindowTitle;responding=$_.Responding}})
 $bounds=[System.Windows.Forms.SystemInformation]::VirtualScreen
 $bitmap=New-Object System.Drawing.Bitmap $bounds.Width,$bounds.Height
 $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
 try{$graphics.CopyFromScreen($bounds.Left,$bounds.Top,0,0,$bounds.Size);$bitmap.Save([IO.Path]::ChangeExtension($ReportPath,'.png'))}finally{$graphics.Dispose();$bitmap.Dispose()}
 $report|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $ReportPath -Encoding utf8
}
function Wait-Window([string]$Title) {
 for($attempt=0;$attempt -lt 120;$attempt++){
  $windows=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
  foreach($candidate in $windows){if($candidate.Current.Name -eq $Title){return $candidate}}
  Start-Sleep -Milliseconds 250
 }
 throw "Native dialog missing: $Title"
}
function Click-NativeButton($Button) {
 $handle=[IntPtr]$Button.Current.NativeWindowHandle
 if($handle -eq [IntPtr]::Zero){throw 'Native button HWND is unavailable'}
 # InvokePattern.Invoke can block the automation process while the next modal
 # dialog opens. Post the real BM_CLICK so we can automate that next dialog.
 if(![ProfileDialogNative]::PostMessage($handle,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero)){throw 'Posting native button click failed'}
}
try{
 Save-Stage 'started'
 if($Mode -eq 'inspect'){Save-Diagnostics;exit 0}
 if($Mode -ne 'qr'){
  Save-Stage 'waiting-for-mode-dialog'
  $window=Wait-Window '图号规划器 · 首次启动'
  $report.matchedWindow=@{name=$window.Current.Name;handle=$window.Current.NativeWindowHandle};Save-Stage 'mode-dialog-found'
  $buttonName=if($Mode -eq 'existing'){'选择旧版数据库'}else{'创建空数据库'}
  $button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$buttonName)))
  if(!$button){throw "Native mode button not found: $buttonName"}
  $report.matchedControl=@{name=$button.Current.Name;id=$button.Current.AutomationId;handle=$button.Current.NativeWindowHandle};Save-Stage 'mode-button-found'
  Click-NativeButton $button
  $report.nativeMessageBox=$true
  Save-Stage 'mode-button-posted'
 }
 if($Mode -in @('existing','qr')){
  if(!(Test-Path -LiteralPath $DatabasePath)){throw 'Selected verification file missing'}
  $title=if($Mode -eq 'qr'){'选择二维码原始PDF'}else{'选择旧版数据目录中的 planner.db'}
  Save-Stage 'waiting-for-file-picker'
  $picker=Wait-Window $title
  $pickerHandle=[IntPtr]$picker.Current.NativeWindowHandle
  $report.matchedWindow=@{name=$picker.Current.Name;handle=$picker.Current.NativeWindowHandle};Save-Stage 'file-picker-found'
  [void][ProfileDialogNative]::SetForegroundWindow($pickerHandle)
  # Set the native filename edit, rather than the address bar. Ctrl+L can merely
  # navigate the dialog, so sending Enter once does not establish selection.
  $edit=$null
  # The actual Windows Server 2025 UIA tree exposes all three filename HWNDs
  # (id 1148) as Pane, including the native Edit. Do not filter by UIA Edit type,
  # or mistake the address bar (id 1001) for the filename entry.
  Save-Stage 'waiting-for-filename-control'
  for($attempt=0;$attempt -lt 120;$attempt++){
   $elements=$picker.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
   $candidates=@($elements|Where-Object{$_.Current.AutomationId -eq '1148'})
   $report.filenameCandidates=@($candidates|ForEach-Object{@{id=$_.Current.AutomationId;name=$_.Current.Name;type=$_.Current.ControlType.ProgrammaticName;nativeClass=(Native-Class $_);handle=$_.Current.NativeWindowHandle}})
   $edit=$candidates|Where-Object{(Native-Class $_) -eq 'Edit' -and $_.Current.IsEnabled}|Select-Object -First 1
   if($edit){break}
   if($attempt -eq 0){Write-Output (ConvertTo-Json -Compress -Depth 5 @{filenameCandidates=$report.filenameCandidates})}
   Start-Sleep -Milliseconds 250
  }
  if(!$edit){throw 'Native filename Edit HWND did not become ready'}
  $editHandle=[IntPtr]$edit.Current.NativeWindowHandle
  $report.matchedControl=@{name=$edit.Current.Name;id=$edit.Current.AutomationId;handle=$edit.Current.NativeWindowHandle;nativeClass=(Native-Class $edit)};Save-Stage 'filename-edit-found'
  $pattern=$null
  if($edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pattern)){
   $pattern.SetValue($DatabasePath);$report.filenameWriteMethod='UIA.ValuePattern'
  }else{
   [void][ProfileDialogNative]::WriteText($editHandle,0x000C,[IntPtr]::Zero,$DatabasePath);$report.filenameWriteMethod='native.WM_SETTEXT'
  }
  $actual=New-Object System.Text.StringBuilder 32768
  [void][ProfileDialogNative]::ReadText($editHandle,0x000D,[IntPtr]$actual.Capacity,$actual)
  if($actual.ToString() -ne $DatabasePath){throw 'Native filename edit did not retain the full path'}
  $report.filenameReadBack=$actual.ToString()
  Save-Stage 'filename-entered'
  # The real tree also contains shell items with id 1 and zero HWND. Select
  # the native Open Button, rather than the first node sharing that numeric ID.
  $open=$null
  for($attempt=0;$attempt -lt 120;$attempt++){
   $elements=$picker.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
   $buttons=@($elements|Where-Object{$_.Current.AutomationId -eq '1'})
   $report.openCandidates=@($buttons|ForEach-Object{@{name=$_.Current.Name;id=$_.Current.AutomationId;handle=$_.Current.NativeWindowHandle;nativeClass=(Native-Class $_)}})
   $open=$buttons|Where-Object{$_.Current.NativeWindowHandle -ne 0 -and (Native-Class $_) -eq 'Button' -and $_.Current.Name -match '^(?:&?Open|打开)(?:\s*\(&?O\))?$' -and $_.Current.IsEnabled}|Select-Object -First 1
   if($open){break}
   if($attempt -eq 0){Write-Output (ConvertTo-Json -Compress -Depth 5 @{openCandidates=$report.openCandidates})}
   Start-Sleep -Milliseconds 250
  }
  if(!$open){throw 'Native nonzero-HWND Open Button did not become ready'}
  $report.matchedControl=@{name=$open.Current.Name;id=$open.Current.AutomationId;handle=$open.Current.NativeWindowHandle;nativeClass=(Native-Class $open)};Save-Stage 'open-button-found'
  Click-NativeButton $open
  Save-Stage 'open-button-posted'
  for($attempt=0;$attempt -lt 40 -and [ProfileDialogNative]::IsWindow($pickerHandle);$attempt++){Start-Sleep -Milliseconds 250}
  if([ProfileDialogNative]::IsWindow($pickerHandle)){throw 'Native picker remained open after submitting the actual file path'}
  $report.nativeFilePicker=$true
 }
 Save-Stage 'completed'
}catch{
 $report.error=$_.Exception.ToString();Write-Output $report.error;Save-Stage 'failed';try{Save-Diagnostics}catch{$report.diagnosticsError=$_.Exception.Message;$report|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $ReportPath -Encoding utf8}
 throw
}
