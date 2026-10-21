param([Parameter(Mandatory=$true)][ValidateSet('existing','fresh','qr')][string]$Mode,[string]$DatabasePath,[Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class ProfileDialogNative {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
}
'@
$root=[System.Windows.Automation.AutomationElement]::RootElement
function Wait-Window([string]$Title) {
 for($attempt=0;$attempt -lt 120;$attempt++){
  $windows=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
  foreach($candidate in $windows){if($candidate.Current.Name -eq $Title){return $candidate}}
  Start-Sleep -Milliseconds 250
 }
 throw "Native dialog missing: $Title"
}
if($Mode -ne 'qr'){
$window=Wait-Window '图号规划器 · 首次启动'
$buttonName=if($Mode -eq 'existing'){'选择旧版数据库'}else{'创建空数据库'}
$button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$buttonName)))
if(!$button){throw "Native mode button not found: $buttonName"}
$pattern=$button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
$pattern.Invoke()
}
if($Mode -in @('existing','qr')){
 if(!(Test-Path -LiteralPath $DatabasePath)){throw 'Fixture database missing'}
 $title=if($Mode -eq 'qr'){'选择二维码原始PDF'}else{'选择旧版数据目录中的 planner.db'}
 $picker=Wait-Window $title
 [void][ProfileDialogNative]::SetForegroundWindow([IntPtr]$picker.Current.NativeWindowHandle)
 Start-Sleep -Milliseconds 300
 [System.Windows.Forms.Clipboard]::SetText($DatabasePath)
 [System.Windows.Forms.SendKeys]::SendWait('^l')
 [System.Windows.Forms.SendKeys]::SendWait('^v')
 [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
}
@{mode=$Mode;nativeMessageBox=($Mode -ne 'qr');nativeFilePicker=($Mode -in @('existing','qr'));database=$DatabasePath}|ConvertTo-Json|Set-Content -LiteralPath $ReportPath -Encoding utf8
