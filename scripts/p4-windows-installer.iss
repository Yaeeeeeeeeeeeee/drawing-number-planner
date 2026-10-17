; Installer wrapper for the already confirmed, unchanged P4 Windows package.
#ifndef PackageRoot
  #error PackageRoot must point to the verified package
#endif
#ifndef InstallerOutput
  #error InstallerOutput must be explicit
#endif

[Setup]
AppId={{BA4A93E5-A8AA-4EF9-B6AF-98361C59B170}
AppName=图号规划器 P4
AppVersion=2026.10.17
AppPublisher=Drawing Number Planner
DefaultDirName={localappdata}\Programs\DrawingNumberPlannerP4
DefaultGroupName=图号规划器 P4
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
DisableProgramGroupPage=yes
OutputDir={#InstallerOutput}
OutputBaseFilename=DrawingNumberPlanner-P4-Windows-x64-Setup
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\图号规划器验收版.exe

[Files]
Source: "{#PackageRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\图号规划器 P4"; Filename: "{app}\图号规划器验收版.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\图号规划器 P4"; Filename: "{app}\图号规划器验收版.exe"; WorkingDir: "{app}"
