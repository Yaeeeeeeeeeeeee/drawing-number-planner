# P4 本机截图反馈：筛选区与外发横向空间（2026-10-16）

## 问题、依据与方案

用户本机样例库验收的四张截图暴露：图号库展开筛选固定两列、PDF/二维码筛选集中在左边、外发范围固定1040px且阶段连续纵排，宽屏右侧留下大片无效空白。延续已批准P4空间适配，不进入P5。

实际检查`p4-adaptive-data.css`：图号主筛选4×280px、1250px以下2×280px，导致跨列的高级筛选本身也不能用完表单宽度，内部再受2/4列规则限制。1920 CSS实测高级区1256px、页面1672px、11项占3行；1366 CSS实测760.5/1118px，11项占6行。PDF保留legacy关键词第2行和按钮第5列规则。QR固定320+4×220px轨道集中左侧。外发旧P4选择区max1040，范围/结果/邮件始终纵排。

先增加只读浏览器回归`verify-p4-filter-layout.mjs`，修复前63断言17失败，记录于work/p4-filter-fix/red.log。随后仅改展示CSS和外发原容器class，不改筛选值/查询处理、组件生命周期、邮件草稿、预览失效、历史及打包逻辑。

## 修改

- 图号高级区占满表单，按可用宽度自动增加列数；1920 CSS下7列、11项2行，窄窗可自动换行；主筛选使用整个工作区的轨道。
- PDF宽屏6个筛选+提交一行，解除旧关键词强制第2行/按钮固定列；中窄窗3列或2列。
- QR筛选轨道分布到工作区右侧，提交按钮靠右，中窄窗换行。
- 输入/筛选控件维持正常阅读宽度（图号高级最大360px、一般输入420px、外发选择480px），不靠无限拉伸填满。
- 外发在工作区CSS宽度≥1500px时范围与真实生成结果并排，邮件草稿在下一整行；较窄仍按01→02→03纵排。缩短标题/阶段间距，保持原hidden切换，不卸载草稿组件。不生成结果、不增加装饰或假内容来填空白。
- 合并本文件原重复筛选声明；更新已有全页检查为验证外发**控件**限宽，不再将旧1040px区域上限当成验收规则。

## 验证边界

专项浏览器69断言通过，覆盖720×600、1024×720、1366×768、1920×1080、2560×1440、3840×2160 CSS。没有API Mock、样例生成或记录复制，查询云端已有空业务库；截图是布局证据，不是Windows样例库/真实业务库的验收结果。此前Windows样例由用户明确选择，本轮未访问/修改其本机数据库。

本机刷新前需停止只读服务，在原源码目录快进拉取本分支、重新Vite构建，再使用原明确指定的旧P4样例DB启动并刷新浏览器。若Git有本地修改则停止，不重置/清理；不要运行正式库写操作。不合并master。

本轮类型检查、Renderer构建及Main编译通过，保留原chunk>500kB提示。全页16组宽高/DPR共518断言通过、无禁止写请求。只读工具关闭后全表摘要及原DB哈希一致（unchanged:true）。相关4文件90项通过；允许回环网络的最终全量908/925，17项失败按文件和完整测试名与前轮一致，无新增失败。首次受限沙箱额外出现12项listen EPERM，重跑后消失。旧失败清单见同名verification JSON，不统称无害环境问题；本轮未重跑E2E，不沿用旧6/8为新结果。Windows高DPI、跨屏与真实业务大列表依然未验证。

## 截图（云端已有业务空库，仅布局）

|页面|1366 CSS|1920 CSS|3840 CSS|
|---|---|---|---|
|图号展开筛选|[1366px](p4-filter-visuals-20261016/drawings-expanded-1366-existing-empty.png)|[1920px](p4-filter-visuals-20261016/drawings-expanded-1920-existing-empty.png)|[3840px](p4-filter-visuals-20261016/drawings-expanded-3840-existing-empty.png)|
|PDF|[1366px](p4-filter-visuals-20261016/files-1366-existing-empty.png)|[1920px](p4-filter-visuals-20261016/files-1920-existing-empty.png)|[3840px](p4-filter-visuals-20261016/files-3840-existing-empty.png)|
|二维码|[1366px](p4-filter-visuals-20261016/qr-1366-existing-empty.png)|[1920px](p4-filter-visuals-20261016/qr-1920-existing-empty.png)|[3840px](p4-filter-visuals-20261016/qr-3840-existing-empty.png)|
|外发|[1366px](p4-filter-visuals-20261016/outbound-1366-existing-empty.png)|[1920px](p4-filter-visuals-20261016/outbound-1920-existing-empty.png)|[3840px](p4-filter-visuals-20261016/outbound-3840-existing-empty.png)|
