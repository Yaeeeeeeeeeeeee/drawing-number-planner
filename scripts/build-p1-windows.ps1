param([string]$Source, [string]$Output,
  [ValidatePattern('^[0-9a-f]{40}$')][string]$Revision = '7d9e7b74ee1222c9b789946dd69d94f89704bfe7',
  [ValidateSet('P1','P2','P3','P4')][string]$Phase = 'P1')
$ErrorActionPreference = 'Stop'
$repository = 'https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner.git'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw '请先安装 Git for Windows' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 24 或更新兼容版本' }
if ([int](& node -p 'process.versions.node.split(".")[0]') -lt 24) { throw '需要 Node.js 24 或更高版本' }
$toolRoot = Split-Path $PSScriptRoot -Parent
if (-not $Source) {
  $Source = Join-Path $toolRoot ('work\acceptance-source-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  if (Test-Path $Source) { throw '目标源码目录已存在，不覆盖' }
  $sourceBranch = if ($Phase -eq 'P1') { 'codex/p1-minimal-workspace-20261014' } elseif ($Phase -eq 'P2') { 'codex/p2-workspaces-20261014' } elseif ($Phase -eq 'P3') { 'codex/p3-module-alignment-20261015' } else { 'codex/p4-workspace-refinement-20261015' }
  & git clone --no-checkout --single-branch --branch $sourceBranch $repository $Source
  if ($LASTEXITCODE -ne 0) { throw '获取源码失败' }
  & git -C $Source checkout --detach $Revision
  if ($LASTEXITCODE -ne 0) { throw '获取固定提交失败' }
}
$Source = (Resolve-Path $Source).Path
if ((& git -C $Source rev-parse HEAD).Trim() -ne $revision) { throw "源码不是精确的 $Revision，停止构建" }
if (& git -C $Source status --porcelain) { throw '源码有未提交修改；不重置、不覆盖' }
if (-not $Output) { $Output = Join-Path $toolRoot ('work\' + $Phase + '-Windows-' + $Revision.Substring(0,7) + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$Output = [IO.Path]::GetFullPath($Output)
if (Test-Path $Output) { throw '交付目录已存在，不覆盖' }
Push-Location $Source
try {
  & npx.cmd --yes pnpm@11.25.0 install --frozen-lockfile --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw '锁定依赖安装失败' }
  & node node_modules/electron/install.js
  if ($LASTEXITCODE -ne 0) { throw 'Windows Electron 下载失败' }
  & node node_modules/typescript/bin/tsc --noEmit
  if ($LASTEXITCODE -ne 0) { throw '类型检查失败' }
  & node node_modules/vite/bin/vite.js build
  if ($LASTEXITCODE -ne 0) { throw 'Renderer 构建失败' }
  & node node_modules/typescript/bin/tsc -p tsconfig.main.json
  if ($LASTEXITCODE -ne 0) { throw 'Main/API 编译失败' }
  $previousRevision = $env:PLANNER_ACCEPTANCE_REVISION; $previousPhase = $env:PLANNER_ACCEPTANCE_PHASE
  $env:PLANNER_ACCEPTANCE_REVISION = $Revision; $env:PLANNER_ACCEPTANCE_PHASE = $Phase
  try {
  & node (Join-Path $PSScriptRoot 'prepare-p1-delivery.mjs') $Source $Output
  if ($LASTEXITCODE -ne 0) { throw '隔离目录包构建失败' }
  } finally { $env:PLANNER_ACCEPTANCE_REVISION = $previousRevision; $env:PLANNER_ACCEPTANCE_PHASE = $previousPhase }
} finally { Pop-Location }
Write-Host "$Phase 验收包已生成：$Output"
Write-Host '关闭旧验收实例后，双击该目录中的图号规划器验收版.exe。无需开发服务器。'
