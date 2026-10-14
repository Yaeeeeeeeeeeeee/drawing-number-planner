# P1 视觉基础与响应式框架：实施与验证记录（2026-10-14）

## 状态与范围

用户明确授权P1；已在独立分支 `codex/p1-minimal-workspace-20261014` 实施。P1开发与可执行的云端验证完成，等待用户验收；不声称Windows人工验收完成，不开始P2、不合并master、不发布。P0设计及验收标准保留为批准时的记录，本文件记载后续授权与实施。

业务页面结构和页面挂载条件不变：图号详情仍行内展开，PDF没有新三栏或假预览，没有P3模块重构及P4拖动。数据库、Schema、迁移、业务API、core算法、IPC、Main恢复和安全设置未修改。2026-10-13两份历史验收文件与原测试保留。

## 修改文件及行为

- `src/renderer/workspace-theme.css`：统一白／灰／黑变量，54px页头、200px宽屏导航、基础控件表格反馈、容器宽度响应规则、短窗内部滚动和模态导航遮罩。列表利用宽屏，规划／BOM／邮件编辑区域限宽1600px；字号不随4K整体放大。少量成功／警告／错误／启停／删除语义色保留。
- `src/renderer/styles.css`、`batch2-ui.css`、`integrated-ui.css`、`approved-ui.css`：保留结构声明，将原蓝灰硬编码展示色迁移到变量，统一放入legacy级联层；workspace层掌管基础视觉和响应式。危险primary按钮在workspace层显式保留红色及hover。
- `src/renderer/main.tsx`：先声明级联层和变量再加载既有模块样式；不是简单追加不可控的全局覆盖。
- `src/renderer/layout/AppShell.tsx`：所有九模块与安全恢复继续挂载；1279px及以下导航默认折叠，宽屏可手动收起。折叠不重建页面。窄窗打开时是模态导航：初始焦点、Tab循环、Escape关闭、背景inert；回焦在React移除inert后执行，真实Chromium已RED→GREEN复核；关闭导航和切换模块保留原页面生命周期。
- `src/main/index.ts`、`window-layout.ts`：初始最小外框720×600，白色背景；加载及renderer zoom变化后测量实际innerWidth/Height与outer/getZoomFactor推算最小外框，计入边框和菜单差异，不把外框当CSS视口。只涉及窗口几何，不改恢复／IPC／安全。实际Windows校准尚未验证。
- `tests/renderer/workspace-shell.test.tsx`、`tests/main/window-layout.test.ts`：新增6个行为／几何回归；导航输入保持、Escape回焦、模态Tab及实测外框／缩放／无效测量。
- `tests/renderer/bom-page.test.tsx`：保留长路径换行断言，jsdom不支持层叠计算时仅解包legacy外层用于既有声明检查；真实层叠由Chromium验证。
- `tests/e2e/second-acceptance-layout.spec.ts`：1200px下先打开导航，使用不含装饰图标的可访问模块名称；原勾选尺寸和横向溢出断言不变。
- `scripts/verify-p1-layout.mjs`：只连接显式给出的127.0.0.1隔离样例服务；GET与原只读预览白名单，其余业务写请求拒绝并登记。26组宽高／DPR，实际生产页、详情和预览、主按钮滚动可达与危险色检查、截图及JSON证据。
- 当前记录、NEXT_STEPS与进度快照同步；旧30项逐项状态／证据不变，不把旧100%当新版完成率。

## 自动验证结果

| 检查 | 本次实际结果 |
|---|---|
| P1相关4测试文件 | 31/31通过，含新增6条；加上进度契约共5文件34/34通过；导航及审查修正有RED→GREEN证据 |
| 全量单元／集成最终运行 | 913项，896通过、17失败；全量不是全绿 |
| 同环境基线b0c31a4副本 | 907项，890通过、17失败；逐项对照，最终没有新增失败 |
| 类型检查 | `node node_modules/typescript/bin/tsc --noEmit`通过 |
| Renderer生产构建 | `node node_modules/vite/bin/vite.js build`通过，>500kB体积警告仍保留 |
| Main/API生产编译 | `node node_modules/typescript/bin/tsc -p tsconfig.main.json`通过 |
| 既有隔离E2E | 最终6/8通过，2失败；保留原业务断言，未伪称8/8 |
| Chromium生产布局 | 26组，494次检查；最终结果见交付JSON，不等于完整Windows工作流验收 |

测试依赖和版本没有变更。初次受限沙箱的监听／子进程EPERM与后续许可环境的结果分开；最终数字使用可监听本地端口的运行。样例由原脚本新建临时库与资料，不操作用户正式库。

### 保留的17项基线失败

7项旧Mock：outbound-mock 1、暂停product-bom-roundtrip 5、recovery-mock 1。

10项其他基线失败：indexed-pdf-resolver 1、outbound-artifact-ownership 1、outbound-package-service 3、qr-file-scanner 1、workspace-paths 2、workspace-settings 1、application-api 1。涉及Windows反斜杠／junction假设、扫描路径及临时文件清理；Linux已复现，其中路径越界保护断言属于真实跨平台缺陷风险，不能统称无害环境失败或宣称安全通过。P1没有修改这些业务模块，不在本轮擅自修复。

E2E最终失败：real-usage-outbound执行到Windows `tar.exe`缺失（ENOENT）；phase-z-four对数据库相对路径使用硬编码反斜杠前缀，在Linux取得0条而预期4条。基线副本同名用例也失败（前者基线遇到根目录初始化时序超时，未到tar步骤；后者同一反斜杠断言）。因此不宣称完整真实使用流程通过，也不将同名失败当作所有原因均已排除的证明。

## 布局证据与限制

生产构建 + 实际API的隔离样例；不是Mock截图。覆盖九模块、真实规划预览、图号原行内详情、产品详情／完整退出预检、BOM编辑、QR详情、外发预览、字典编辑／删除确认和恢复反馈（不执行恢复）。

26组包括720×600、960×540短高、1080×900、1280×720、1920×1080、2560×1440、3840×2160；按125%／150%／200%理论逻辑尺寸及DPR组合，加上满足最低尺寸的半屏模拟。检查viewport宽高、document及workspace溢出、页面异常，滚动后主操作／确认的边界可达，以及实际危险按钮颜色。记录无禁止业务写请求。最后回焦修正后另运行12组228次代表尺寸检查（720／960／1280／3840宽度及其DPR组合），包含真实键盘焦点循环／Escape回焦，0失败、0禁止写请求；两轮结果分开保存，不相加为验收完成率。初轮二维码入场横移产生4个短暂溢出，现改透明度动效；字典删除确认说明另补换行规则及真实计算样式断言，防止继承表格nowrap导致说明截断。最终不沿用失败轮作通过证据。

这些仅为Linux Chromium布局与有限操作可达烟测；没有验收所有编辑保存、删除、恢复或每个弹窗，不等于720×600全部业务工作流人工通过。小于720×600的案例只观察降级，不升级最低支持承诺。

尚需Windows：所有支持的系统缩放组合、原生窗口／菜单／边框到CSS视口的校准，真实720×600内容最低窗口，最大化／窗口化／半屏的宽高，跨不同缩放显示器双向移动，字体／图标清晰度、原生确认框及完整业务工作流。云端无Windows桌面和多显示器，不以DPR模拟代替。

## 独立审查与风险

独立只读审查发现两项Important：窄窗导航焦点管理、级联层覆盖危险按钮色；均已修正并验证。Minor：缩放后重新校准及检查范围表述，已补校准回调与明确烟测边界。

主要风险是广泛色值迁移影响局部层级、导航抽屉改变键盘顺序、容器响应式改变原控件排列、窗口测量依赖原生平台。现有测试、基线对照与生产检查减小风险，但仍需用户Windows视觉与交互验收。路径保护基线失败与完整恢复／生产权限／稳定性门禁继续保留。

Ruling：云端checkout已隔离，在现有checkout建立独立分支并保留已批准P0文档，未另复制工作树；避免丢失已批准未提交内容，代价是同一checkout当前分支切换。P1颜色变量迁移可涉及模块CSS但不改变模块结构；误判代价是局部视觉回退，已用真实生产界面检查。没有未解决的设计授权冲突。

## 复核命令与交付

启动隔离样例：`node --import tsx scripts/preview-second-acceptance.ts`；它新建临时样例，不使用正式库。只读布局：`PLANNER_UI_CHECK_URL=http://127.0.0.1:5187 node scripts/verify-p1-layout.mjs`；设置PLANNER_CHROMIUM可使用本机Chromium路径。未装浏览器／无法监听时报告未执行，不能算通过。

全矩阵截图和结果保存于 `work/p1/layout/`，最后键盘复核截图和结果位于 `work/p1/final-focus-layout/`；基线／最终测试JSON、构建和E2E日志保存于 `work/p1/`（本地忽略的验证工作目录）。实际界面截图已在聊天展示，未声称已生成可下载的交付包。不将全量日志、临时数据库或原始用户文件提交。

P1完成后停止，等待用户验收和下一阶段明确授权。无PR、未推送、未发布、未合并。
