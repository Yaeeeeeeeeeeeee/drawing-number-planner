; Chinese installer for the pinned P4 candidate; user data stays outside the install directory.
#ifndef PackageRoot
  #error PackageRoot must point to the verified package
#endif
#ifndef InstallerOutput
  #error InstallerOutput must be explicit
#endif

[Setup]
AppId={{69BB0C19-7394-4ADC-92D1-54A7D56B32EF}
AppName=图号规划器
AppVersion=2026.10.20
AppPublisher=Drawing Number Planner
DefaultDirName={localappdata}\Programs\DrawingNumberPlanner
UsePreviousAppDir=no
DefaultGroupName=图号规划器
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
DisableProgramGroupPage=yes
DisableDirPage=no
DirExistsWarning=yes
ShowLanguageDialog=no
OutputDir={#InstallerOutput}
OutputBaseFilename=图号规划器-Windows-x64-安装包
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\图号规划器.exe

[Languages]
Name: "chinesesimplified"; MessagesFile: "installer-languages\ChineseSimplified.isl"

[Files]
Source: "{#PackageRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\图号规划器"; Filename: "{app}\图号规划器.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\图号规划器"; Filename: "{app}\图号规划器.exe"; WorkingDir: "{app}"

[Code]
function HasOldAcceptanceSeed(const Directory: String): Boolean;
begin
  Result := DirExists(AddBackslash(Directory) + 'resources\app\acceptance-seed');
end;

function ExistingSampleMessage(): String;
begin
  Result := '所选目录中存在旧版示例资料。为确保本版以无业务数据状态安装，请选择新的安装目录。旧目录、示例资料和个人数据不会被删除。';
end;

function InitializeSetup(): Boolean;
var
  RequestedDirectory: String;
begin
  { Refuse an explicitly supplied old target before a silent wizard is created. }
  RequestedDirectory := ExpandConstant('{param:DIR|}');
  Result := not ((RequestedDirectory <> '') and HasOldAcceptanceSeed(RequestedDirectory));
  if not Result then
    Log(ExistingSampleMessage());
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
