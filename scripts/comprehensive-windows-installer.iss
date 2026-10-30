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
AppVersion=1.3.1
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

[UninstallDelete]
Type: files; Name: "{app}\installation.id"

[Code]
function NormalizeInstallDirectory(const Directory: String): String;
begin
  Result := Directory;
  if (Directory <> '') and
     (CompareText(RemoveBackslashUnlessRoot(ExpandFileName(Directory)),
       RemoveBackslashUnlessRoot(ExpandConstant('{userdesktop}'))) = 0) then
    Result := AddBackslash(ExpandConstant('{userdesktop}')) + 'DrawingNumberPlanner';
end;

procedure BrowseInstallDirectory(Sender: TObject);
var
  Directory: String;
begin
  Directory := WizardDirValue;
  { The shell picker exposes Desktop and redirected known folders. Preserve
    selected subfolders exactly; keep application files out of Desktop itself. }
  Log('Opening Windows Shell installation-folder picker');
  if BrowseForFolder('选择安装文件夹（可以选择桌面上的文件夹）', Directory, True) then
  begin
    WizardForm.DirEdit.Text := NormalizeInstallDirectory(Directory);
    Log('Selected installation folder: ' + WizardDirValue);
  end
  else
    Log('Windows Shell installation-folder picker cancelled');
end;

procedure InitializeWizard();
begin
  { Also normalize /DIR before silent Setup processes the directory page. }
  WizardForm.DirEdit.Text := NormalizeInstallDirectory(WizardDirValue);
  WizardForm.DirBrowseButton.OnClick := @BrowseInstallDirectory;
end;

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
  RequestedDirectory := NormalizeInstallDirectory(RequestedDirectory);
  Result := not ((RequestedDirectory <> '') and HasOldAcceptanceSeed(RequestedDirectory));
  if not Result then
    Log(ExistingSampleMessage());
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpSelectDir then
    WizardForm.DirEdit.Text := NormalizeInstallDirectory(WizardDirValue);
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

procedure CurStepChanged(CurStep: TSetupStep);
var
  InstallationId: String;
begin
  if CurStep = ssPostInstall then
  begin
    { A successful installation gets its own identity, even for the same version.
      This marker is application metadata; no business directory is touched. }
    InstallationId := GetDateTimeString('yyyymmddhhnnsszzz', '-', ':');
    if not SaveStringToFile(ExpandConstant('{app}\installation.id'), InstallationId, False) then
      RaiseException('无法保存本次安装标识，请检查安装目录权限。');
  end;
end;
