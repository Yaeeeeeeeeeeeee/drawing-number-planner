# v1.3.1 邮件导入热修复

## 根因与修复

用户只选首批H14完整交付场景，并将DD抄送联系人公司与供应商分开维护。导入创建新联系人时仍错误要求联系人公司等于模板厂家；此前全量导入验收未覆盖“仅选一条，并调整新建共享抄送公司的组合”；而已存在共享联系人会进入复用路径，不会触发这条新建限制。修复在既有模板-联系人角色关系上允许经确认的跨公司联系人，不更改已有联系人字段。邮箱/字段验证、指纹防过期、导入前备份和事务回滚保持。

失败和成功消息此前在长滚动窗口顶部，点击底部按钮时看不到。本版将提交结果放在同一固定底栏，增加导入中状态，失败保留编辑与核对选择，可以修正后重试；不绕过任何模板、联系人或历史案例审查。

代码：src/core/import/email-template-import.ts，src/renderer/pages/EmailTemplateImport.tsx/.css。回归：tests/core/email-template-matrix.test.ts，tests/renderer/email-template-import.test.tsx；scripts/verify-1.3.1-mail-import.cjs由浏览器和Windows已安装应用共用，检查真实XLSX/API/SQLite、错误可见、回滚、跨公司抄送和原记录保护。

## 验证状态

两条失败回归已实际复现并修复；相关5文件19项通过。原始上传Excel私下核验H14只选1条、场景按截图调整、抄送公司DD：实际保存1模板、5联系人、5角色关联，其余24候选跳过，原件不变，来源H14保留。原始内容、个人邮箱和签名不发布。真实匿名XLSX浏览器流程已通过：先提交未知变量验证失败/整事务回滚和按钮旁可见提示，再更正后成功保存，其他旧记录不变。

最终完整自动化197文件1663项通过，完整端到端12项通过，类型/构建通过。Windows41000356740已完成实际安装业务验收（含新增跨公司联系人、未知变量失败回滚、可见反馈及修正重试）；正式发布41000883838成功，Tag v1.3.1固定源码34f6954d28ec4d4a481e58ca4b804c765a69b414。不新增数据库迁移，保持Schema23。现有本地配置、原始PDF/图片、占号/BOM/外发快照不修改。


## 正式交付

[下载安装器](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/download/v1.3.1/DrawingNumberPlanner-1.3.1-Windows-x64-Setup.exe) · [Release及Windows报告/截图](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/tag/v1.3.1)。公开文件已实际下载：EXE145113632字节，SHA256 `de55f2c90fc82fb56f0da1e55e42e0e37febaaf75e5e99ef94b1f218f67365c5`；报告ZIP SHA256 `08fb98aed9b29465b9b1e3fcff4301b2498b02344a3c2e9fb035ae256f48153d`，与SHA256SUMS一致。Windows hotfix131所有检查为真、rendererErrors为空，错误提示位于900高窗口的817.5–857像素范围，实际截图已查看。

提交34f6954修复代码及测试，cef41c4发布固定成功工件；后续仅补交付记录。用户本地正式库和物理DPI未在环境中；保持当前库和本地路径，启动不执行归并或清理。
