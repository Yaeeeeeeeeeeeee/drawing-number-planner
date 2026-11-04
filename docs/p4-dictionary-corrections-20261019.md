# 编码字典补充修正（2026-10-19）

用户补充：已删除记录需要永久删除；恢复后名称只能粘贴，不能键盘编辑；右侧按钮尺寸统一。与浮动目录合入同一候选分支，未操作真实业务数据。

## 永久删除

已删除行增加“永久删除”，先只读核查并显示真实阻止原因；仅已删除且无引用时允许输入完整编码确认。请求还携带核查时名称和删除时间；服务器在begin immediate事务内重新验证这些信息和引用，才物理删除唯一指定字典行。不得通过force参数绕过，不级联删除、不解除外键、不改文件、历史快照或占号。没有Schema迁移。

核查包含数据库实际所有指向dictionary_items的外键（含CASCADE/SET NULL/未来新增表）、当前及历史图号编码快照；项目明细按主类别+项目编码配对。主类存在任何子级（含已删除）也阻止。旧DELETE接口拒绝已删除行，防止绕过完整编码/预检；普通删除遇到历史编码快照改为保留身份，不物理破坏解释关系。独立审查发现该旧入口绕过后已补测试并关闭，复查无剩余Important问题。

只读预检：GET /api/dictionaries/items/:id/permanent-deletion；确认删除：DELETE /api/dictionaries/items/:id/permanent。新增API仍走原有认证/启动令牌边界。原普通删除、恢复及其他业务入口保留。截图“验收样例”若仍有产品/历史图号引用，会明确禁止永久删除；添加按钮不等于已删除该记录。

## 恢复后键盘编辑

追踪Renderer、API、Service和Repository：名称字段未设只读，服务允许已恢复记录改名并保持编码。恢复路径使用window.confirm原生阻塞对话框，与用户“只能粘贴”表现的焦点/输入路径相关；改为页面内确认，保留明确恢复确认，编辑名称时聚焦可编辑输入框，不再开启原生确认框。不能据此声称已在用户机器重现所有输入法问题。

回归先在旧流程验证失败，再检查恢复后编辑、保存失败保留草稿及重试。浏览器真实键盘事件覆盖字母键入、Ctrl+A、光标移动、Backspace、Delete及保存，而非仅fill或粘贴。Windows候选包另执行真实Electron删除→恢复→键盘编辑→保存，并将原样例名称还原；不新建样例记录。用户物理键盘/中文输入法仍需本机验收。

## 按钮与验证

行操作“修改、启用/恢复、停用、删除/永久删除”均76×32px；编辑区保存/取消同尺寸，间距统一。危险确认组统一高度和组内宽度，保留小范围语义色，避免大面积彩色背景。窄窗口允许表格内部横向滚动。

永久删除新11项测试在旧实现全部失败；恢复不用原生确认的新回归也先失败。最终相关测试/构建及Windows结果见机器可读报告。数据库测试仅内存数据库；浏览器全部接口夹具且截图标明。全量套件本轮未重跑，前次16项既有失败不关闭。

主要文件：dictionary-repository/service/types、dictionaries路由、client、DictionariesPage/DictionaryPermanentDelete、workspace-theme、相关Core/API/Renderer测试及浏览器/原生Windows验证脚本。没有删除用户数据，没有变更Schema，没有自动合并本轮或替换已确认Release。

本轮进一步按用户“所有修改删除”要求，逐页检查品牌、品类尺寸、外观、颜色、主类别父级及项目明细，所有行操作76×32px，保存/取消同尺寸；六窗口均通过。Windows首轮在重打包前被旧Main全不变保护挡住，未启动/交付失败程序；现只允许两处明确授权的菜单可见性语句，另有2项工具保护测试，安全/恢复/依赖/Schema校验不放宽。

## Windows 候选交付

[原生Windows流程39215880675](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/39215880675) 全部成功，应用修订 `3a6f23f`。安装逐文件哈希一致，原生菜单默认隐藏且原恢复菜单保留，六窗口目录默认展开/宽屏不遮挡/窄屏覆盖通过。

在原有隔离样例中对一条既有品牌执行普通删除→页面内确认恢复→真实键盘事件输入/光标/Backspace/Delete→保存，再恢复原始名称；最终全表逐行快照与开始一致，原样例文件未变。全部行操作及保存/取消为76×32px。原生永久删除仅核对只读预检会阻止原样例引用，不为制造场景新增记录或删除历史；真正物理删除成功与并发阻断由内存SQLite/Core/API测试覆盖。

[安装EXE验收包](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/39215880675/artifacts/12170010304)（ZIP内含Setup.exe、实际Windows截图与JSON报告，144926565字节）及[完整免安装包](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/39215880675/artifacts/12168943797)，保留到2026-11-02。完整解压前者后运行DrawingNumberPlanner-P4-Windows-x64-Setup.exe；仍使用本修订独立AppData验收样例，不导入或覆盖正式数据。

最终90项相关测试+2项打包保护测试、类型检查、Renderer/Main构建和六窗口接口夹具通过，独立复查无剩余Important问题。[完整变更记录PR #2](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/pull/2) 保持草稿，未合并master，未替换此前确认Release。用户本机中文输入法、物理4K/DPI/跨屏仍须人工验收；CI键盘事件不等于这些证据。
