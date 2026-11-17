# v1.6.2 公开交付核对记录

2026-11-17（上海）。以下文件已从公开Release地址实际下载到隔离开发工作区，核对实际字节数和SHA256；不是仅检查API存在。

- [Release与全部附件](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/tag/v1.6.2)
- [Windows安装器](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/download/v1.6.2/DrawingNumberPlanner-1.6.2-Windows-x64-Setup.exe?download=1)
- [固定应用源码Tag](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/tree/v1.6.2)：`0610c06e8d73c2e616b5b2c0b0364ecb55aba784`
- [Windows安装/运行验证44011078119](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/44011078119)：成功。
- [最终发布44042455047](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/44042455047)：成功；文档/发布源码`a7263f3b67f64a40c16e3811c16f2e87c3fa96fc`。

| 实际下载文件 | 字节数 | SHA256 |
|---|---:|---|
| DrawingNumberPlanner-1.6.2-Windows-x64-Setup.exe | 147183693 | `31feead1adeb77525877753dafc7e7687f3caa7d0d04bbd71f14ee5dfb7ebfdb` |
| Verification-Windows-1.6.2-Verified.zip | 9355770 | `402df3becbd8ee8e6b1bb724dbe22d00743b686d8a9f0aa606e99fbe354ab12c` |
| Verification-Automated-1.6.2.zip | 707491 | `fcf5584c486665a3a6bb23ee310c95ac802d04d3422d8102f37976376a4af3d0` |

安装器MZ头及大小正确，实际摘要与公开`SHA256SUMS.txt`及GitHub资产摘要一致。两个ZIP的CRC均通过；自动化包17文件中16份实际证据逐一与MANIFEST大小/摘要一致。Windows包184文件/127张原始截图，报告revision与固定源码一致，未修改截图。

正式应用源码和发布文档提交分别可追溯，不把文档提交误标为安装器源码。原v1.6.1 Tag仍为`a296e04ee1570d9af6721a4879a60261cdb2cd6a`，没有移动旧Tag、切换默认分支或自动合并master。原工作区五份审计候选资料和其他未提交修改保留。

代码实施：`c1cc95d`；阅读器布局：`8a2f251`；打包校验：`d040099`；Windows筛选验收：`f014f6a`；两项用户补充规则和目录隔离：`ae64f92`；原生AIT验收：`16c0cf4`；抄送恢复验收：`0610c06`。交付文档`a053167`、原始日志附件`a7263f3`。

安装前退出旧版并完整备份实际dataDir，安装后选需要沿用的旧planner.db，等待安全升级到Schema26，保留原本地资料路径。回退1.6.1需配套迁移前Schema25备份，不能直接打开26。详细步骤见[版本说明](../release-1.6.2.md)。

本次生产数据库操作为**未执行**；没有在用户电脑自动安装或覆盖版本。用户重新整体验收、真实Adobe字体/版式/可编辑PDF、原T40库、物理DPI和实际打印仍未执行，见[最终报告](FINAL_REPORT.md)。
