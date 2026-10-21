# 图号规划、外观关联与资料库验证记录

2026-10-20；隔离内存数据库、真实 SQLite/Fastify 服务及 React 渲染器测试。未操作真实库或原 PDF，未提交。

已实现：
- 规范产品身份查询及显式外观版本规划；存在多个外观时不得省略版本。正式占号在 immediate 事务内再次验证并同时保存原始图号和版本绑定，软删除产品不可规划。完整占号集合继续决定流水号。
- 原始产品 ID、原始目录精确 SKU+型号、原始外观与颜色码诊断；不读取 PDF 派生产品作为证据。歧义/缺少版本待确认，扫描历史的 product_id、detected SKU/型号均视作目录派生候选，单凭这些字段与编码唯一也不自动关联；只有独立明确 BOM 图号 ID 与外观版本依据、且原未归属和唯一候选时才允许自动关联。
- 人工修正及批量预览确认，证据/目标/记录 ID/指纹，确认事务复核，修正审计保留原图号、raw 外键及历史业务引用。
- 跨版本显式 BOM 使用可进入目标版本图号列表、版本计数；保留原图号和原外观归属，多个使用关系按记录去重。
- 类别→型号→外观导航；八列图号表、抽屉关联修正、实际 PDF/BOM/历史与占号依据。批次在详情选择器中查看；不同批次/产品文件不混入当前资料。
- 每页 10/25/50/100 独立记忆；已应用条件分页、完整查询键缓存、最后请求胜出、加载时保留表格并标明上次结果。占号成功可跳转对应产品/外观资料库。

验证证据：
- `/tmp/drawing-verification-complete.log`：11 文件 130 测试通过（drawing-association、planning-service/reservation/repository、drawing-query/deletion、server planning/drawings、renderer drawing-library/origin/planning）。
- `/tmp/drawing-final-followup.log`：诊断状态及审计展示修订后 3 文件 50 测试通过，无未处理拒绝。
- `/tmp/drawing-final-domain.log`：软删除产品拒绝规划及目标有效性修订后 3 文件 21 测试通过。
- 包含 HTTP plan→reserve→外观查询及计数、规划成功导航回调、快速连续切换外观的旧响应丢弃、稳定表格 DOM、未提交条件不影响翻页、旧材料新版本复用且不改原归属/不重复计数。
- `git diff --check` 通过。全局 typecheck 的其他任务在途错误由主整合任务处理；本任务最后 typecheck 未报告所属源文件错误。

本记录不替代 Windows、真实库副本或用户本地 ZC100 归并验收。

独立审查修正：`/tmp/drawing-evidence-red.log` 两项新增回归先失败；修复后 `/tmp/drawing-evidence-final.log` 诊断/真实归并两文件13测试通过，覆盖扫描product_id非空及空两路径、人工预览确认、明确BOM独立依据和归并后旧绑定只读规范身份解析。
