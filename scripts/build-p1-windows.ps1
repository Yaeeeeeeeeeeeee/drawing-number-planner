param([string]$Source, [string]$Output)
$ErrorActionPreference = 'Stop'
$revision = '7d9e7b74ee1222c9b789946dd69d94f89704bfe7'
$repository = 'https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner.git'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw '请先安装 Git for Windows' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 24 或更新兼容版本' }
if ([int](& node -p 'process.versions.node.split(".")[0]') -lt 24) { throw '需要 Node.js 24 或更高版本' }
$toolRoot = Split-Path $PSScriptRoot -Parent
if (-not $Source) {
  $Source = Join-Path $toolRoot ('work\p1-source-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  if (Test-Path $Source) { throw '目标源码目录已存在，不覆盖' }
  & git clone --single-branch --branch codex/p1-minimal-workspace-20261014 $repository $Source
  if ($LASTEXITCODE -ne 0) { throw '获取 P1 源码失败' }
}
$Source = (Resolve-Path $Source).Path
if ((& git -C $Source rev-parse HEAD).Trim() -ne $revision) { throw '源码不是精确的 7d9e7b7，停止构建' }
if (& git -C $Source status --porcelain) { throw '源码有未提交修改；不重置、不覆盖' }
if (-not $Output) { $Output = Join-Path $toolRoot ('work\P1-Windows-7d9e7b7-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
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
  & node (Join-Path $PSScriptRoot 'prepare-p1-delivery.mjs') $Source $Output
  if ($LASTEXITCODE -ne 0) { throw '隔离目录包构建失败' }
} finally { Pop-Location }
Write-Host "P1 验收包已生成：$Output"
Write-Host '关闭旧验收实例后，双击该目录中的图号规划器验收版.exe。无需开发服务器。'
