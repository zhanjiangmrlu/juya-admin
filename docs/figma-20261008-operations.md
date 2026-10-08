# A10–A16 活动与反馈 Figma 还原交接

日期：2026-10-08。开发对话 2；状态：READY_FOR_INTEGRATION。

按 `docs/superpowers/plans/2026-10-08-admin-figma-restoration.md` 和节点清单实施，直接使用当前 main。未新建分支、worktree、对话或子代理，未提交、暂存、推送或操作其他作者改动。公共壳、tokens、router、导航、组件均由集成负责。

## 页面映射与改动

七个节点均先加载 figma-design-to-code 技能，再调用包含截图的 get_design_context；返回高精度内容，无 sparse 响应。静态设计内容均为文字和基础形状，没有图片/SVG 资产引用，无需下载静态素材；未使用整张设计图作为页面。反馈截图继续由原控制器签发和清理动态 URL。

| 页面               | Figma 节点 | 路由                    | 归属文件与改动                                                                                                                                                                                                                                                         |
| ------------------ | ---------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A10 限时活动列表   | 2538:559   | /campaigns              | src/pages/campaigns/campaign-list-page.vue：浅绿筛选区、真实状态中文显示、新建入口、圆角表格、版本及开通人数/容量、操作说明；保留状态筛选、刷新、分页、编辑与版本跳转。                                                                                                |
| A11 限时活动编辑   | 2538:637   | /campaigns/:id/edit     | src/pages/campaigns/campaign-edit-page.vue：约 690:452 双栏，左侧活动基础配置，右侧发布前检查和状态操作，新增当前开通人数展示；保留所有 v-model、保存、复制、状态二次确认、409 草稿保留与状态禁用。返回列表放在主卡操作区。                                            |
| A12 活动版本与容量 | 2538:700   | /campaigns/:id/versions | src/pages/campaigns/campaign-version-page.vue：浅绿版本字段卡、右侧容量卡、强调标记、管理提醒；保留版本 ID/序号/状态/期限/启动窗口/开通时间/场景，容量下限、禁用条件、确认对话框和幂等命令。                                                                           |
| A13 消息中心       | 2538:761   | /work-items             | src/pages/work-items/work-item-page.vue：待办合为单张浅绿卡，红/黄/绿优先级标记、逐行操作按钮；保留原优先待办/信息提醒分组、服务端顺序、刷新、空态与原跳转。                                                                                                           |
| A14 问题反馈列表   | 2538:823   | /feedback               | src/pages/feedback/feedback-list-page.vue：浅绿筛选区、设计顺序表格（标题分类/用户/来源/截图/状态/时限/操作）、说明卡；完整日期字段放在展开行中，保留查询条件、路由恢复、分页、纯文本说明和禁用的导出按钮。                                                            |
| A15 问题反馈详情   | 2538:901   | /feedback/:id           | src/pages/feedback/feedback-detail-page.vue：主要双栏为用户说明与来源、完整处理时间线，管理提醒紧接主要区域；补充/回复/内部备注/截图/日期信息置于后续记录区，保留全部真实记录、处理入口和临时截图按钮。                                                                |
| A16 反馈回复与关闭 | 2538:962   | /feedback/:id/respond   | src/pages/feedback/feedback-respond-page.vue：左侧发送处理结果及内部备注，右侧回复前检查与确认提示；开始处理/补充要求/信息不足关闭置于后续处理区。保留所有命令、表单输入、长度限制、按钮禁用、状态条件、草稿保留、错误和幂等行为；处理期限用现有北京时间格式工具展示。 |

设计文件：[句芽英语管理后台](https://www.figma.com/design/evoGqXQ4pI3Q3cdLpc6NOc?node-id=2538-559)。

## 检查与结果

归属代码已逐页审阅模板和脚本差异。七页业务脚本保持原状，A16 仅增加现有时间格式工具导入用于只读日期展示。没有修改 feature TS、API adapter、controller、权限、校验或业务状态。样式只在归属页面 scoped SCSS 内覆盖。

| 命令                                                                                                                                                                                                                          | 结果                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm exec prettier src/pages/campaigns/_.vue src/pages/work-items/_.vue src/pages/feedback/*.vue --check                                                                                                                      | 通过，7 个页面。                                                                                                                              |
| pnpm exec eslint src/pages/campaigns/_.vue src/pages/work-items/_.vue src/pages/feedback/*.vue --max-warnings=0                                                                                                               | 通过。                                                                                                                                        |
| pnpm exec stylelint src/pages/campaigns/_.vue src/pages/work-items/_.vue src/pages/feedback/*.vue --max-warnings=0                                                                                                            | 通过。Element Plus BEM 覆盖有页面级 selector-class-pattern 注释，其他规则保持有效。                                                           |
| pnpm exec vitest run src/features/campaigns src/features/work-items src/features/feedback src/pages/feedback --maxWorkers=2                                                                                                   | 12 个测试文件、28 项测试通过。                                                                                                                |
| pnpm exec playwright test --config .impeccable/review/operations-20261008/playwright.config.ts --grep '反馈补充要求\|反馈列表支持\|反馈截图每次\|内部备注失败\|A14 至 A16\|campaign 409\|capacity command\|campaign creation' | 8 项通过：活动冲突保留草稿、容量确认及幂等、创建/复制、反馈查询分页详情返回、截图再次签发及不持久化、内部备注保存、补充要求、反馈三页双视口。 |
| pnpm exec playwright test --config .impeccable/review/operations-20261008/visual.config.ts                                                                                                                                    | 14 项通过，七页在 1440×900 / 1280×800 均无页面横向溢出、无 pageerror、无未定义夹具请求；A13 使用七种待办夹具并验证首条处理入口跳转。          |
| pnpm exec eslint tests/e2e/feedback-loop.spec.ts --max-warnings=0；pnpm exec prettier tests/e2e/feedback-loop.spec.ts --check                                                                                                 | 通过；只将归属反馈视口测试的页面标题选择器从页面 h2 改为公共顶栏 h1。                                                                         |
| git diff --check -- src/pages/campaigns src/pages/work-items src/pages/feedback tests/e2e/feedback-loop.spec.ts                                                                                                               | 通过。                                                                                                                                        |

浏览器验证使用独立端口 15174，独立配置与证据目录。验证配置关闭 Vite HMR/watch，防止并行作者保存公共文件导致浏览器中途刷新；测试等待工作台呈现后再做路由切换。早期有模板片段定位错误，已修复并重新通过样式、单元及浏览器检查。早期截图检查也出现过登录/路由等待失败；上述结果均来自修复后的完整复跑。

浏览器请求使用现有 admin-api 模拟夹具。验证确认页面到 adapter 的请求格式、状态与交互，未调用真实生产服务。

## 截图证据

独立目录：`.impeccable/review/operations-20261008/screenshots/`（git 忽略，只保留本地证据）。14 张最终截图已逐张实际打开检查布局、控件可读性、卡片边界及溢出。

| 页面 | 1440×900                     | 1280×800                     |
| ---- | ---------------------------- | ---------------------------- |
| A10  | screenshots/A10-1440x900.png | screenshots/A10-1280x800.png |
| A11  | screenshots/A11-1440x900.png | screenshots/A11-1280x800.png |
| A12  | screenshots/A12-1440x900.png | screenshots/A12-1280x800.png |
| A13  | screenshots/A13-1440x900.png | screenshots/A13-1280x800.png |
| A14  | screenshots/A14-1440x900.png | screenshots/A14-1280x800.png |
| A15  | screenshots/A15-1440x900.png | screenshots/A15-1280x800.png |
| A16  | screenshots/A16-1440x900.png | screenshots/A16-1280x800.png |

表中路径相对独立证据目录。交互输出位于 `results/`，双视口检查输出位于 `visual-results/`。测试配置和视觉巡检脚本也留在同目录便于复跑，未更改公共 Playwright 配置或 fixtures。

## 决策与剩余边界

- A10 现有列表契约没有关键字搜索、期限、场景数；保留原活动状态筛选和刷新，显示实际可用的版本/容量/开通人数，不增加无效搜索、不额外批量拉取详情、不填入设计样例数值。
- A11 现有控制器只允许 DRAFT 编辑全部字段，OPEN 等状态须通过版本页调整容量；保留这条业务边界。设计中的场景名称在当前模型中只有场景 ID，显示真实 ID。
- A12 契约只提供当前版本，没有完整版本变更历史；右侧实现现有容量调整，不伪造设计中的 v1/v2/v3 历史记录。
- A13 现有服务提供逐条待办及固定类型映射，未提供设计中的按类别汇总数量；保留逐条消息和真实分组计数。信息提醒继续保持原只读展示，没有擅自新增业务操作。
- A14 导出仍保持原禁用状态；搜索沿用编号/用户编号接口能力。提交/补充/更新时间可从展开行查看，避免主表过宽。
- A15/A16 根据真实记录和可执行操作增减内容，长记录向下延伸；没有用设计的反馈内容、时间或处理结果代替服务端数据。A16 没有新增业务未支持的“保存回复草稿”，内部备注仍独立提交；补充与关闭操作完整保留。
- 七页页面标题由公共顶栏显示，避免重复。混合测试 `tests/e2e/entitlements-campaigns.spec.ts` 的 A05–A12 旧视口用例仍依赖 level:2 标题和宽泛版本文字选择器；本对话未修改覆盖其他作者页面的混合用例。集成可统一调整为公共 h1，并对 A11 选择具体版本字段。本对话已经独立完成 A10–A12 双视口及其现有 3 项写操作流程。
- 未运行跨仓库/全仓门禁或创建构建产物；pnpm check、全量单元测试、build 与总验收由集成负责。没有生产发布、真实管理员写操作或真实对象存储验收。

归属实现已完成，无剩余代码阻塞；设计与接口的能力差异已按保留业务要求处理。提交统一由集成完成。
