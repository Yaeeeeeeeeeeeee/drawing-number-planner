# 默认展开的浮动工作导航（2026-10-19）

用户要求去掉截图红框内顶部栏并将目录改为浮动式，随后明确“不要默认收起”“不覆盖内容上方，只要宽度到必须覆盖的时候再覆盖”。按该最后要求实现，不以早先默认收起/全部覆盖的提议为准。

## 实现

- 删除Renderer顶部品牌/模块横栏。保留各模块本身的标题、表格、筛选及全部业务功能。
- 导航默认展开，12px外边距、220px浮动面板；宽屏为业务内容预留244px，不相互遮挡。不再有跨全宽顶部栏。
- 内容预算为720px，导航和内边距所需约1012px，当前以1024 CSS px为切换边界。更窄时目录覆盖显示、业务内容宽度不再受压缩，保留遮罩/Esc/Tab焦点圈定；宽屏不遮罩、不锁业务区。
- 手动收起后保留小按钮；关闭/重开不卸载当前模块，窗口跨临界宽度不擅自重置打开状态。宽屏选模块保持目录展开，覆盖模式选模块后关闭。图号及外发未保存离开确认保留。
- Windows原生“应用”菜单默认隐藏，原始菜单及安全恢复IPC/确认未移除，可通过Alt调出原生菜单。标题栏、最小化/最大化/关闭按钮不改变。
- 根布局使用独立navigation-wide标识，避免和业务ModuleWorkspace内部navigation-docked选择器串用。

## 验证与边界

原实现上4项新导航测试全部失败；修正后40项相关测试通过，覆盖默认展开、宽/窄开关、焦点、遮罩、跨临界缩放、输入保留、外发离开确认以及恢复/桌面启动与最小窗口规则。类型检查和Renderer/Main构建通过。

浏览器使用全部拦截的接口夹具，不打开业务数据库；3840×2160、1920×1080、1100×760、1024×760、1023×760、720×600验证主内容从Y=0开始、全窗口高度、无整页横向溢出、宽屏目录右边缘232≤业务区左边缘244、窄屏覆盖且保留输入/焦点。截图明确标注夹具，不作为真实业务数据或物理Windows/DPI验收。

完整套件未为此局部UI改动重跑，前次994项中16项同名既有失败不因此关闭。Windows安装候选包将另行验证菜单实际隐藏、默认展开、宽窄切换及原样例文件不变。此次不自动合并master、不修改历史Schema/数据/PDF/文件关系或替换此前已确认Release。

## 主要变更文件

AppShell.tsx、workspace-theme.css、src/main/index.ts（仅菜单可见性）、workspace-shell.test.tsx；浏览器/Windows验证脚本、独立候选包Workflow、安装版本号及本次规则/进度/截图文档。

## Windows 候选交付

[原生Windows流程39215880675](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/39215880675) 全部成功，应用修订 `3a6f23f`。安装逐文件哈希一致，原生菜单默认隐藏且原恢复菜单保留，六窗口目录默认展开/宽屏不遮挡/窄屏覆盖通过。

在原有隔离样例中对一条既有品牌执行普通删除→页面内确认恢复→真实键盘事件输入/光标/Backspace/Delete→保存，再恢复原始名称；最终全表逐行快照与开始一致，原样例文件未变。全部行操作及保存/取消为76×32px。原生永久删除仅核对只读预检会阻止原样例引用，不为制造场景新增记录或删除历史；真正物理删除成功与并发阻断由内存SQLite/Core/API测试覆盖。

[安装EXE验收包](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/39215880675/artifacts/12170010304)（ZIP内含Setup.exe、实际Windows截图与JSON报告，144926565字节）及[完整免安装包](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/39215880675/artifacts/12168943797)，保留到2026-11-02。完整解压前者后运行DrawingNumberPlanner-P4-Windows-x64-Setup.exe；仍使用本修订独立AppData验收样例，不导入或覆盖正式数据。

最终90项相关测试+2项打包保护测试、类型检查、Renderer/Main构建和六窗口接口夹具通过，独立复查无剩余Important问题。[完整变更记录PR #2](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/pull/2) 保持草稿，未合并master，未替换此前确认Release。用户本机中文输入法、物理4K/DPI/跨屏仍须人工验收；CI键盘事件不等于这些证据。
