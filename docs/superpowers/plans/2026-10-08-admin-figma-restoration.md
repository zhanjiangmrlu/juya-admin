# 管理后台 Figma 还原与并行交付

日期：2026-10-08。用户授权按指定设计稿实现，并创建多个开发对话并行。
仓库：D:/个人/juya/juya-admin，main；初始工作区干净。
设计：evoGqXQ4pI3Q3cdLpc6NOc，页面 2534:818；26 个主页面、4 个补充状态，1440×900。

## 目标与约束

保留现有 API、控制器、校验、权限、状态和事件；按 Figma 实现现有页面，不用设计示例数据替换真实数据。
Figma design-to-code 必须先读技能，再逐节点 get_design_context（包含 screenshot）；页面节点不能直接用于上下文。
当前计划为已有后台的视觉还原，执行方法是用户请求的三个本地开发对话，加当前集成对话。
不新建分支、worktree，不推送。开发对话共享仓库，只改归属文件，不执行 reset/stash/checkout/全局格式化/git add .。
开发对话不提交，统一由集成对话检查并提交中文 Conventional Commit。不得新增对话或子代理。
无法做真实服务验证时明确使用模拟 API，不宣称生产验收。

## 公共设计基准

页面背景 #f7f1e3；侧栏 #fffdf7、宽 222px；顶部 90px；主区左 32px、右 26px、上 30px。
卡片 #fffdf8，边框 #d8e5d1，圆角 18px；主色 #326b44；深文字 #264536；次文字 #748678。
顶栏标题 28px，副标题 13px；卡片标题 20px；按钮圆角 10px、常规高度 38px。
以上为 A01 已读取高精度上下文的公共值，各页细节以自己的设计节点为准。
集成负责 src/styles、src/layouts、src/app、src/router、src/components、测试公共 fixtures/config。
页面作者不要复制顶栏标题，主页面保留有意义的说明和操作行；集成将在公共顶栏实现设计标题、副标题。
保留现有折叠侧栏和全部页面导航入口，视觉使用浅色侧栏与分组。

## 三个并行开发对话

### 1 用户与权益 A02–A09

归属 src/pages/users、src/pages/contacts、src/pages/entitlements 中的 Vue 与相关测试。
设计节点：A02 2538:17；A03 2538:103；A04 2538:164；A05 2538:225；
A06 2538:311；A07 2538:374；A08 2538:437；A09 2538:498。
交接 docs/figma-20261008-users.md。
验证现有相关单元测试；需要浏览器时独立本地端口，不占集成 5173/4173/15173/14173。

### 2 活动与反馈 A10–A16

归属 src/pages/campaigns、src/pages/work-items、src/pages/feedback 中的 Vue 与相关测试。
设计节点：A10 2538:559；A11 2538:637；A12 2538:700；A13 2538:761；
A14 2538:823；A15 2538:901；A16 2538:962。
交接 docs/figma-20261008-operations.md。
验证现有相关单元测试；浏览器采用独立端口。

### 3 内容生产 A17–A24 与 4 个补充状态

归属 src/pages/content 中的 Vue 与相关测试，以及 src/features/content-production、src/features/content-editor、src/features/ocr、src/features/audio 中 Vue 展示组件（不改 TS 业务）。
设计节点：A17 2538:1022；A18 2538:1100；A18S 2538:1166；A18T 2538:1229；
A19 2538:1289；A19S 2538:1352；A20 2538:1415；A21 2538:1481；
A22 2538:1550；A22S 2538:1612；A23 2538:1674；A24 2538:1737。
A18/A19/A20/A21 在现有六阶段生产流程中映射 draft/ocr/proofread/audio；
独立批量导入、OCR详情和音频版本页仍保留。
交接 docs/figma-20261008-content.md。
保留草稿、OCR显式触发/人工采纳/额度、音频标时和预览发布流程。不得调用真实 OCR/TTS，不绑定未确认音频，不发布内容。
验证现有内容单元测试；浏览器采用独立端口。

## 集成对话职责

归属公共文件、A01 src/pages/dashboard/dashboard-page.vue、
A25 src/pages/analytics/analytics-page.vue、A26 src/pages/settings/settings-page.vue；
设计 A01 2537:18；A25 2538:1809；A26 2538:1872；公共导航 2537:2。

- [x] 建立公共色彩、间距、组件基准。
- [x] 按 Figma 完成公共壳与 A01/A25/A26。
- [x] 等待并读取三个交接，核对 30 个画板与现有路由/生产阶段映射。
- [x] 运行 pnpm check、pnpm test --maxWorkers=4、pnpm build。
- [x] 1440×900、1280×800 浏览器验证页面，覆盖导航、主要业务交互与 4 个补充状态。
- [x] 检查横向溢出、重叠、表单/表格/素材比例，修复本次范围问题。
- [x] 输出总验收 docs/figma-20261008-integration.md，区分设计还原与真实业务/生产边界。
- [x] 统一中文提交，只暂存此次归属文件。

## 交接必填项

每页设计节点/路由/改动；运行命令及结果；截图证据路径；未完成/阻塞；提交由集成统一处理。
