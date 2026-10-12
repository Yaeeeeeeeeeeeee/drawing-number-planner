# BOM UI 第一版 · 待用户验收

## 范围与基准

- 图号库第三版已通过验收，保持冻结。本轮仅扩展其高密度、正常安静、异常局部突出、长标识符易扫描的设计语言到 BOM。
- 四个 Skill 实际读取：drawing-number-planner、ui-ux-pro-max、frontend-design、impeccable。业务 Current 与用户指定工作效率优先于通用设计建议。
- 编辑与查询采用紧凑结构化记录；九个核心字段全部直接可见：项目 / 图号 / 生效批次 / 材质 / 尺寸 / 图片 / 位置 / 位置示意图 / 修改明细。主类别、白色图号引用和备注继续保留；没有二维码编辑。
- 不改 Schema、migration、正式 API、查询请求、保存校验或历史数据规则。所选旧记录仍可进入编辑，不通过日期或内部版本号推断 Current。

## 独立开发 Mock

- 开启：开发服务 URL `?mock=bom`。默认关闭，production 的 DEV gate 不允许启用。退出：移除参数并重新加载。
- 压力场景通过页面选择器切换，或 `&bom-scenario=long` 等参数。normal / long / attachments / references / unselected / empty / no-results / loading / error / conflict。
- Mock API 不接受、不读取、不持有真实 API；未定义方法默认拒绝。负数 ID 仅用于 renderer 内存 fixture，隔离不依赖 ID 不重合。
- 保存、更新、上传、删除、删除整个型号、附件归档与打开位置在预览中禁用。conflict 仅允许 Mock 保存方法抛出 BOM_STALE，以检查已有冲突反馈；没有成功写入实现。
- 附件只用内嵌开发示意图或失败占位，不访问真实附件预览 API，不操作磁盘或原始 PDF。
- Mock 入口直接进入 BOM；其他模块导航与真实恢复工具禁用，避免从预览上下文进入真实维护入口。
- 内存草稿编辑、添加/移除项目、查询与旧记录编辑可操作，刷新后恢复样例。
- references 场景保留已作废原引用。空候选场景：添加项目，选择“包装资料 → 无候选预览项目”。沿用附件、双角色/单角色/均无、预览失败、当前/历史/缺失批次均包含在样例中。

## 验证证据

- 测试先行：初始隔离测试实测失败（真实 API 被读取 4 次、附件 src 指向真实预览接口），实现后通过。
- 全量 89 个测试文件 / 831 个测试通过，其中 BOM 页面既有 24 个测试及新增 Mock 21 个测试通过。
- Renderer typecheck、主进程 TypeScript build、Vite production build、git diff --check 通过。
- 1080 / 1200 / 1280：密集编辑、长内容编辑、所选旧记录查询明细、记录表及其他 8 类反馈场景均检查。页面、记录和实际记录网格没有横向溢出；查询表可完整显示操作。
- 正常编辑记录实测约 239–262px；长内容项目约 291–295px。全部字段分为主体与第二行内容，没有额外详情步骤。查询完整附件路径保持可读换行，信息较多的记录约 242–274px。
- 文件输入禁用；程序化 change 也被 handler 拒绝。真实 API getter、桌面打开位置未被触发；未知维护方法拒绝。附件图片 src 全部为 data URI。
- 键盘 Tab 从材质到尺寸，焦点轮廓可见；Enter 可进入查询路径；旧记录材质字段仍可编辑。
- 既有附件路径测试 fixture 补齐其实际类型要求的 role / inheritedFromBomItemAssetId；沿用测试改为检查 checkbox 语义，完整文件名仍在附件摘要显示。

## 继续保留的 BUG/TODO（没有在本轮修复或关闭）

1. 历史录入最终更新 current BOM pointer 的业务语义。
2. 主类别是否应参与查询过滤；现请求仍只包含原有过滤参数。
3. 作废引用提示与旧记录实际保存条件不一致；保留原提示与原 complete predicate，阻塞摘要不额外改变校验。
4. BOM 加载仍请求二维码候选。本轮明确保留 listBomQrCandidates 的加载依赖，未删除。
5. 旧 BOM 可编辑与历史快照保护的业务关系；本轮不改变旧记录编辑或跨模块快照。
6. 图号库已有 Mock 筛选完整性、样例一致性及 origin/status 维度问题：继续保留图号库 Review TODO，本轮未处理。

## 后续边界

第一版交付后停止，等待用户验收；不自行开展第二版，不扩散到 PDF、二维码或外发资料，不合并 master。Mock 为独立文件，后续可移除 URL gate、入口连接及对应测试，不涉及数据库回滚。
