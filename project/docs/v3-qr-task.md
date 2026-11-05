# V3 二维码管理实施与验证（2026-10-22）

本任务按 `docs/v3-business-ui-requirements-20261022.md` 第八、九节及项目 Skill 的 V3 当前授权实施。未接触用户本地业务库。

## 变更与真实原因

- 原文件名正则仅接受大写首字母的英文用途，且不允许括号前空格，导致 `B500-warranty（hwh0kd9）.pdf` 被拒。现仅规范化受支持英文用途的合理大小写/词间空格，接受配对全角、半角括号及括号前空格。型号和网址七位尾码仍精确、区分大小写核对，不推断身份。URL 查询参数和尾随斜杠继续由 URL 解析处理。
- 列表固定为 SKU、型号、产品类别、说明书、售后卡、菜谱、操作七列。仅 SKU 左对齐，其余居中；用途展示实际启用/停用状态，尚未创建显示未配置，不使用记录计数推断状态。
- 产品按规范产品 ID 分组，展开五列保持用途、关联文件、网址、业务状态、操作；仅文件左对齐。历史不同 QR ID 保持独立，不合并旧记录。
- 去除传统分页和条数选择，使用共享 `DataTable virtualize` 有界 DOM。展开状态保留在页面，刷新保留列表容器及现有展开行，不清空数据等待请求。
- 手工弹窗删除独立外观版本选择及其请求。新建 QR 明确发送产品共享范围 `appearanceVersionId: null`。替换已有记录仍在内部发送原记录的 legacy `appearanceVersionId`，避免服务拒绝或历史身份被改写。旧导航传入外观目标也不将其强制用于新建。
- 保持原 portal 与 fixed 居中遮罩，保留型号/用途、网址、文件选择、预检、确认，以及现有必要名称和尾码。未恢复扫描候选、自动匹配或待人工确认区域。

## 接口与保护边界

无 Schema、迁移、HTTP API、服务字段变更。复用原生文件选择 capability token → `qrManualPreview` → `qrManualCommit`。

`QrManualService` 的现有格式/真实 PDF 内容校验、文件变更指纹、重复提交保护、版本/产品身份校验、不可变文件登记与追加审计均未放宽。非 PDF 扩展名（含 `.pdf.cmd`）仍硬性拒绝；新规则不重命名文件、不移动文件、不修改原始字节。更换/解除关联不改变 URL、业务状态、占号或其他模块历史引用。

`H10-warranty-avakyo（g8gwcl6）.pdf` 仍不被静默解析为规范名称：必须通过原有明确理由、显式确认的例外机制并写入现有审计；没有新增审批体系。

## 红绿验证

先增加真实回归用例，再修改生产代码：

1. `work/v3-qr-red.log`：3 files failed，12 failed / 29 passed（41 total）；新增小写/空格解析、七列无分页、无外观选择用例暴露旧实现。随后修正一处测试局部变量遗漏。
2. `work/v3-qr-green1.log`：40 passed / 1 failed，唯一剩余为测试变量遗漏，已修正。
3. `work/v3-qr-green2.log`：73 passed / 2 failed；一处旧测试依赖已废弃“创建产品自动建版本”，改为显式创建 legacy fixture；真实 HTTP 集成因沙箱禁用本机监听报 EPERM，申请该测试所需网络权限后执行。
4. `work/v3-qr-green3.log`：12 files，75 tests passed。
5. `work/v3-qr-virtual.log`：11 renderer tests passed，新增 1000 产品滚动测试，初始及滚到底部 DOM 行数均小于 60，最后产品可访问且无分页。
6. 最终 `work/v3-qr-final.log`：**12 files / 77 tests passed**，耗时 28.11s。

最终命令：

```sh
node node_modules/vitest/vitest.mjs run \
 tests/core/qr-manual-validation.test.ts tests/core/qr-manual-service.test.ts \
 tests/core/qr-service.test.ts tests/core/qr-file-scanner.test.ts \
 tests/core/qr-file-classifier.test.ts tests/server/qr-manual-api.test.ts \
 tests/server/qr-codes-api.test.ts tests/main/qr-manual-integration.test.ts \
 tests/main/qr-manual-actions.test.ts tests/main/open-qr-file.test.ts \
 tests/renderer/qr-codes-page.test.tsx tests/renderer/qr-mock.test.tsx --maxWorkers=1
```

核心回归使用真实临时 SQLite 和真实 `%PDF` 文件字节，验证小写 Warranty 文件可关联、磁盘字节/全名不变、H10 例外有审计、legacy scope 替换不改身份、共享与旧版本 QR 独立、关联/解除历史保留、重启可读。实际桌面桥/HTTP 集成测试覆盖可信文件选择、服务持久化与重启，而非模拟保存。Renderer 测试以 API fixture 验证界面分组、交互、错误保留、无整页刷新及有界 DOM；不冒充用户真实数据库验收。

`git diff --check` 对本任务文件通过。并行开发期间运行全项目 typecheck，未出现 QR 所属文件错误；当时外发/FilesPage/AppShell/共享虚拟表测试存在其他任务进行中的错误，已报告集成人，不据此宣称全项目通过。

## 交付集成仍需检查

父任务负责全项目回归、构建、GitHub、Windows 安装包及实际桌面验证。Windows 原生验证脚本必须移除旧“手动二维码外观版本”选择，使用新共享范围且不要覆盖已存在的同产品同用途 QR。本任务没有声称物理 1080P/2K/4K、DPI、用户真实数据或 Windows 原生窗口验收已完成。
