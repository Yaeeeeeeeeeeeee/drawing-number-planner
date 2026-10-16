# P4 GitHub连接失败后的离线更新（2026-10-16）

用户Windows先报Recv failure: Connection was reset，单次HTTP/1.1重试后又报Failed to connect github.com:443。停止要求反复联网pull；无需修改全局代理、SSL或执行策略。应用目标保持b0333c3505d34d64deca83c29757b9f1b124c5c5，不改应用/业务规则或进入下一阶段。

新增只读权限的p4-offline-update.yml，通过GitHub Actions创建包含完整提交历史的Git bundle，引用refs/heads/offline-p4-b0333c3。下载工具可将CI artifact作为附件转交，用户更新过程只访问解压后的本地bundle，完全不连接GitHub。包内只有bundle、SHA256SUMS及README，无EXE、数据库、脚本或用户资料。

本地隔离验证：b15773b和083c20e两个干净旧版本均能从本地bundle快进到精确b0333c3；有未提交README修改时预检拒绝，HEAD与本地文字保持不变。包完整性经git bundle verify验证，无缺少历史前置对象。Windows原机执行尚待用户；不声称本轮Windows打包/业务验收通过。

## 使用

下载附件ZIP并解压到新文件夹，不覆盖原目录。关闭旧只读服务，在PowerShell运行以下内容；选择解压出来的P4-offline-b0333c3.bundle（不是文件夹，不是数据库）。所有验证失败立即停止，不重置/清理/覆盖本地改动。

```powershell
& {
    Set-Location -LiteralPath 'C:\Users\Administrator\Desktop\UI修正\P4-adaptive-readonly' -ErrorAction Stop
    if ((git branch --show-current) -ne 'codex/p4-adaptive-data-workspaces-20261015') { throw '当前分支不符合，已停止。' }
    if (git status --porcelain) { throw '存在本地修改，已停止，不会覆盖。' }
    Add-Type -AssemblyName System.Windows.Forms
    $offlinePicker = New-Object System.Windows.Forms.OpenFileDialog
    $offlinePicker.Title = '选择解压后的 P4 离线更新 bundle 文件'
    $offlinePicker.Filter = 'Git bundle (*.bundle)|*.bundle'
    if ($offlinePicker.ShowDialog() -ne 'OK') { return }
    git bundle verify $offlinePicker.FileName
    if ($LASTEXITCODE -ne 0) { throw '离线包校验失败，已停止。' }
    $offlineHead = git bundle list-heads $offlinePicker.FileName refs/heads/offline-p4-b0333c3
    if ($offlineHead -notmatch '^b0333c3505d34d64deca83c29757b9f1b124c5c5 ') { throw '不是本轮目标版本，已停止。' }
    git pull --ff-only $offlinePicker.FileName refs/heads/offline-p4-b0333c3
    if ($LASTEXITCODE -ne 0) { throw '离线快进失败，已停止。' }
    if ((git rev-parse HEAD) -ne 'b0333c3505d34d64deca83c29757b9f1b124c5c5') { throw '当前版本与目标不同，不自动回退。' }
    node node_modules/vite/bin/vite.js build
    if ($LASTEXITCODE -ne 0) { throw '构建失败，已停止。' }
    node --import tsx scripts/readonly-workspace.ts --database 'C:\Users\Administrator\Desktop\UI修正\P4-Windows-8dc2112-20261015-163451\resources\app\acceptance-seed\planner.db'
}
```

服务打印127.0.0.1:5190后刷新浏览器Ctrl+F5，继续只读样例验收。不新增数据、不覆盖旧验收包、不合并master。源码目录没有node_modules或数据库位置不同则停止核对，不重新猜数据库。

## CI附件交付结果

Actions运行38856841167已成功；artifact12027775750，P4-offline-update-b0333c3，5546575字节，保留至2026-10-30。artifact ZIP摘要：e080cac2450a2c4d9015cf7def51322bf9cd506f7bddf165b2160951e711df81。已通过连接器下载接口转为可交付文件引用；不要求用户Git连接GitHub。目标应用仍固定b0333c3，打包提交47bb8ba未改应用。
