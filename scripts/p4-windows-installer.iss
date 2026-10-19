; Chinese installer for the pinned P4 candidate; user data stays outside the install directory.
#ifndef PackageRoot
  #error PackageRoot must point to the verified package
#endif
#ifndef InstallerOutput
  #error InstallerOutput must be explicit
#endif

[Setup]
AppId={{BA4A93E5-A8AA-4EF9-B6AF-98361C59B170}
AppName=图号规划器 P4
AppVersion=2026.10.20
AppPublisher=Drawing Number Planner
DefaultDirName={localappdata}\Programs\DrawingNumberPlannerP4-Empty
UsePreviousAppDir=no
DefaultGroupName=图号规划器 P4
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
DisableProgramGroupPage=yes
DisableDirPage=no
DirExistsWarning=yes
ShowLanguageDialog=no
OutputDir={#InstallerOutput}
OutputBaseFilename=DrawingNumberPlanner-P4-Windows-x64-Setup
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\图号规划器验收版.exe

[Languages]
Name: "chinesesimplified"; MessagesFile: "installer-languages\ChineseSimplified.isl"

[Files]
Source: "{#PackageRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\图号规划器 P4"; Filename: "{app}\图号规划器验收版.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\图号规划器 P4"; Filename: "{app}\图号规划器验收版.exe"; WorkingDir: "{app}"

[Code]
function HasOldAcceptanceSeed(const Directory: String): Boolean;
begin
  Result := DirExists(AddBackslash(Directory) + 'resources\app\acceptance-seed');
end;

function ExistingSampleMessage(): String;
begin
  Result := '所选目录中存在旧版示例资料。为确保本版以无业务数据状态安装，请选择新的安装目录。旧目录、示例资料和个人数据不会被删除。';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = wpSelectDir) and HasOldAcceptanceSeed(WizardDirValue) then
  begin
    MsgBox(ExistingSampleMessage(), mbError, MB_OK);
    Result := False;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  { Runs in interactive and silent /DIR installs, before any package file is copied. }
  if HasOldAcceptanceSeed(ExpandConstant('{app}')) then
    Result := ExistingSampleMessage()
  else
    Result := '';
end;
