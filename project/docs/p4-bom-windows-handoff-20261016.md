# P4 BOM Windows免安装验收包（2026-10-16）

应用固定 `d4a6359c26f6dd8534c99d1b4d0328ca1a2d9dd5`，包含本轮BOM查询历史对照修改。用户本轮明确要求可直接运行的验收交付，无须再在Windows执行Git更新、Node安装或构建。

## 最少操作

1. 关闭旧测试版。将ZIP**全部解压到新的文件夹**，不要覆盖正式版或旧测试版。
2. 双击文件夹里的 **图号规划器验收版.exe**。保留同目录的resources、DLL等文件，不能只拿走exe。
3. 核对标题：**图号规划器 P4 BOM 验收版 · d4a6359**。
4. 点击 **BOM管理 → 查询BOM → 查看2026-09-28记录**。
5. 检查首次记录提示、完整资料、单项折叠/展开、全部收起/展开、图号复制图标及附件实际状态。最大化后再缩小窗口，检查文字、按钮和滚动是否正常。

发现问题时，记录所在项目及操作，截图发回即可。不要为验收新增、修改、删除业务记录，不执行扫描、清理、迁移或打包。

## 数据与安全边界

- 本包复用既有P4 Windows制品（旧运行38697339387，artifact11955251774，应用8dc2112）中的Windows运行环境、原生SQLite依赖及**原有隔离样例**。锁定的依赖和数据库/服务/主进程业务代码与新应用版本一致，交付工具先核对Git差异及旧包manifest。
- 没有运行 `preview-second-acceptance.ts` 或新建/复制业务行来制造效果。包装前后原seed所有文件逐一SHA一致，原始旧包也保持不变。
- 首次启动沿用原隔离bootstrap，将原有隔离样例放入新的 `DrawingNumberPlannerAcceptance/d4a6359` 专属运行目录，正式应用及旧测试版不覆盖、不自动打开。正式库不能交给本测试包，不把资料根目录改到正式目录。
- 原样例只有1版BOM、3项目，因此这次可直接验收**首次记录、折叠、附件状态及布局**；「有上一条记录」的新增/删除/修改/未变化模式仍需有相应历史的已有真实资料，不能把首条记录当作完整多版本验收。相关真实数据验收保持未完成，自动化夹具测试不是其替代。
- 包内 `sample-reuse-verification.json` 记录原seed文件指纹；`windows-verification.json` 记录实际Windows启动和查询、原样例/运行副本全表计数与内容指纹；截图标明Windows实测窗口。此包不构成正式发布或完整Windows系统DPI/跨屏验收。

## 包装与版本追溯

新交付工具仅在全新输出目录写入；不覆盖旧目录，不更改应用固定SHA。打包复用旧Windows运行环境，只替换经构建的应用内容、隔离入口版本标题及交付说明。移除副本内旧Windows烟测证据，避免把旧证据称作本版通过。

工作流：`.github/workflows/p4-bom-windows-delivery.yml`；包装：`scripts/repack-p4-bom-windows.mjs`；实际Windows烟测：`scripts/verify-p4-bom-windows.cjs`。工作流权限只有contents/actions读取，不发Release、不合并master。

包是未签名的免安装目录包，不是安装器。若浏览器或Windows拦截，不关闭防护；提供拦截详情以核对。项目内GitHub下载链接和最终附件摘要将在成功制品生成后补记；没有成功Windows结果不称为已验证测试包。

## 已生成的Windows制品与验证结果

- 应用仍为d4a6359；交付工具提交7520429。
- WindowsCI [38864217262](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/38864217262) 成功：取用旧制品、固定源类型/两端构建、原seed逐文件哈希、真实exe启动/隔离标记/健康检查、BOM首次记录/折叠/附件及六组原生窗口尺寸、原样例与运行副本全表内容摘要不变，均通过。
- [GitHub备用下载：P4-BOM-Windows-x64-d4a6359](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/38864217262/artifacts/12030701034)，ZIP166,093,819字节，2026-10-30前保留。另已通过连接器提供可在聊天中直接下载的附件，不要求用户Windows连接GitHub。
- ZIP SHA-256：`1cb3d717b995f441b4d54d3af3a7896e7de827af57599537da4e20f5bdc401ab`。
- 包内含 `图号规划器验收版.exe`、`先看这里-验收说明.txt`、`windows-verification.json`、`sample-reuse-verification.json` 及Windows-BOM-3840/1920/1100截图。实际Windows运行报告以包内JSON为准，物理4K屏、用户Windows系统DPI、跨屏和真实多版本业务历史仍未验证。
- 相关进度文档测试3项通过；应用未变化，不重复宣称全量全绿，原953中17项基线失败仍保留。不合并master、不发布正式Release。
