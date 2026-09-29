# juya-admin V1.3 开发设计

## 1. 背景与目标

`juya-admin` 是句芽英语 V1.3 的单管理员内容与运营后台。本次开发覆盖设计稿 A01–A26，并遵循以下资料：

1. `doc/句芽英语V1完整设计稿-20260927/句芽英语V1完整需求文档-开发需求交付版-逻辑修改确认版.md`
2. `doc/技术设计方案/03-juya-admin-技术设计方案.md`
3. `doc/接口文档/juya-admin-api-接口文档.md`
4. `doc/句芽英语V1完整设计稿-20260927/PNG/后台端/A01-A26`
5. `doc/句芽英语V1完整设计稿-20260927/交互原型/dist/`

需求文档定义业务规则，技术方案定义工程边界，接口文档定义当前可以真实调用的契约，PNG 与交互原型定义视觉和页面结构。发生冲突时，不扩大后端能力，不使用演示数据伪装真实接口结果。

## 2. 已确认范围

- 直接在 `main` 分支开发。
- 页面覆盖登录页以及 A01–A26。
- UI 组件统一采用 Element Plus，并通过项目令牌和组件封装还原交付设计稿。
- 当前接口文档已包含的接口真实接入。
- 尚未提供接口的页面仍实现完整路由、UI、状态模型和类型化 adapter，明确显示“接口待接入”，未知命令不可提交。
- 不修改 `juya-admin-api`。
- Git 提交按阶段拆分，提交说明使用 `feat: 中文描述`；测试补充可使用 `test: 中文描述`。

## 3. 工程架构

```text
src/
├─ app/                         # 应用启动、路由守卫、全局错误处理
├─ layouts/
│  └─ admin-layout/            # 侧栏、顶栏、内容区
├─ pages/                       # 登录页和 A01–A26 路由页
├─ features/
│  ├─ auth/
│  ├─ dashboard/
│  ├─ users/
│  ├─ contacts/
│  ├─ entitlements/
│  ├─ campaigns/
│  ├─ work-items/
│  ├─ feedback/
│  ├─ content/
│  ├─ ocr/
│  ├─ audio/
│  ├─ publishing/
│  ├─ batch-jobs/
│  ├─ analytics/
│  └─ system-config/
├─ components/
│  ├─ data-table/
│  ├─ status-tag/
│  ├─ confirm-dialog/
│  ├─ audit-timeline/
│  ├─ sensitive-value/
│  ├─ task-progress/
│  └─ pending-capability/
├─ services/
│  ├─ api/
│  ├─ upload/
│  └─ observability/
├─ stores/
├─ shared/
│  ├─ contracts/generated/
│  ├─ errors/
│  ├─ permissions/
│  └─ utils/
└─ styles/
```

页面通过 feature composable 访问业务能力，composable 通过 adapter 调用 API client：

```text
页面 → feature composable → adapter → API client → juya-admin-api
```

页面不得直接依赖生成 DTO。Pinia 只保存管理员会话、全局配置、导航和跨页任务提醒；列表、表单和详情数据保留在各 feature 中。

## 4. 路由与导航

| 页面 | 路由                               | 模块         |
| ---- | ---------------------------------- | ------------ |
| 登录 | `/login`                           | 管理员认证   |
| A01  | `/dashboard`                       | 工作台       |
| A02  | `/users`                           | 用户管理     |
| A03  | `/users/:userId`                   | 用户管理     |
| A04  | `/contacts/corrections/:id`        | 用户管理     |
| A05  | `/entitlements`                    | 统一权益中心 |
| A06  | `/entitlements/formal/grant`       | 统一权益中心 |
| A07  | `/entitlements/limited/grant`      | 统一权益中心 |
| A08  | `/entitlements/formal/:id/action`  | 统一权益中心 |
| A09  | `/entitlements/limited/:id/action` | 统一权益中心 |
| A10  | `/campaigns`                       | 限时活动配置 |
| A11  | `/campaigns/:id/edit`              | 限时活动配置 |
| A12  | `/campaigns/:id/versions`          | 限时活动配置 |
| A13  | `/work-items`                      | 消息中心     |
| A14  | `/feedback`                        | 问题反馈     |
| A15  | `/feedback/:id`                    | 问题反馈     |
| A16  | `/feedback/:id/respond`            | 问题反馈     |
| A17  | `/content/scenes`                  | 内容生产     |
| A18  | `/content/import`                  | 内容生产     |
| A19  | `/content/ocr/:taskId/:itemId`     | 内容生产     |
| A20  | `/content/scenes/:id/edit`         | 内容生产     |
| A21  | `/content/scenes/:id/audio`        | 内容生产     |
| A22  | `/content/scenes/:id/publish`      | 内容生产     |
| A23  | `/content/discovery-config`        | 内容生产     |
| A24  | `/content/jobs`                    | 内容生产     |
| A25  | `/analytics`                       | 汇总统计     |
| A26  | `/settings`                        | 系统配置     |

侧栏使用 Element Plus `ElMenu` 与 `ElSubMenu`。一级业务模块严格为工作台、用户管理、统一权益中心、限时活动配置、消息中心和问题反馈；内容生产、系统配置和汇总统计位于“基础能力”分组。每个模块展开显示对应的 A01–A26 页面；需要具体业务对象 ID 的流程页只在已有上下文时可直接选择，否则提示从所属列表进入。路由元数据包含标题、导航分组、权限、页面编号和敏感数据标记。

## 5. Element Plus 与视觉系统

主要组件映射如下：

- 布局：`ElContainer`、`ElAside`、`ElHeader`、`ElMain`。
- 导航：`ElMenu`、`ElMenuItem`、`ElBreadcrumb`。
- 列表与筛选：`ElTable`、`ElPagination`、`ElForm`、`ElInput`、`ElSelect`、`ElDatePicker`。
- 操作反馈：`ElDialog`、`ElDrawer`、`ElMessage`、`ElAlert`、`ElSkeleton`、`ElEmpty`、`ElResult`。
- 内容生产：`ElUpload` 负责文件选择，原生 `XMLHttpRequest` 服务负责上传进度和取消。
- 状态与高风险操作：基于 Element Plus 封装业务组件，不直接散落第三方组件配置。

全局 SCSS 令牌覆盖 Element Plus CSS 变量。设计基线为深绿色侧栏、中性浅色背景、白色面板、8px 面板圆角、绿色主按钮、橙红蓝灰状态色。页面样式使用 scoped SCSS 并在页面根类下嵌套。

1440×900 为主验收尺寸，1280×800 为回归尺寸。1280 宽度下允许隐藏次要表格列或在表格容器内部滚动，但页面整体不得横向滚动。

## 6. 会话与安全

登录使用管理员账号和密码，验证成功后直接建立会话。CSRF token 只保存在内存 Store，认证 Cookie 由浏览器管理。当前接口没有正式的会话查询端点，刷新时暂用受保护的只读配置接口进行认证探测；未来新增会话查询后只替换 auth adapter。

- 401：清空 Store 和敏感缓存，进入登录页。
- 403：保留目标路径并显示无权限状态。
- 标签关闭、退出登录和会话失效时不持久化敏感内容。
- 微信号、反馈正文、截图签名 URL 和内部备注不进入 URL、localStorage、sessionStorage 或普通错误上报。
- 敏感页面离开时销毁页面状态并取消未完成请求。

## 7. API 能力边界

### 7.1 真实接入

- 账号密码登录、退出登录。
- 系统配置读取和更新、审计事件。
- 用户查询、微信号搜索、用户详情。
- 工作台、待办、匿名统计导出。
- 正式权益预览与操作命令。
- 限时权益授予、补救、暂停、恢复和撤销。
- 反馈详情、开始处理、要求补充、回复和关闭。
- 上传策略与上传确认。
- 内容草稿版本、发布检查、发布、下线、开放场景和预览配置。

### 7.2 待接入

- 联系资料更正列表和命令、敏感复制审计、联系状态操作。
- 权益列表、活动列表、活动版本编辑和容量管理。
- 反馈列表、完整时间线和截图签名地址。
- 内容列表、结构化内容保存、OCR、音频版本和批量任务。
- 图表型统计查询和正式会话查询。

`capability registry` 为每项能力声明 `available` 或 `pending`。待接入 adapter 返回统一 `pending` 状态，不发起未知请求；按钮保持禁用并提供缺失接口说明。

## 8. 页面状态与错误处理

所有页面数据使用统一状态：

```text
idle | loading | success | empty | error | pending
```

- 新筛选请求取消旧请求。
- 普通筛选同步 URL query；完整微信号搜索使用 POST，URL 只保存已执行敏感搜索的布尔标志。
- 409 显示服务端当前状态或 revision，要求刷新后重试。
- 422 映射字段错误并保留表单内容。
- 429 显示限流说明和可重试时间。
- 5xx 显示操作建议和 Request ID，不显示内部异常。
- 命令成功后失效相关查询并重新读取详情。

高风险命令统一使用 `ConfirmDialog`，展示对象编号、操作前状态、操作后状态或影响范围，收集必要原因，并在提交时生成 `X-Idempotency-Key`。

## 9. 关键业务约束

- 正式权益期限只允许 `MONTH_1`、`MONTH_2`、`MONTH_3`、`MONTH_6`、`MONTH_12`、`PERMANENT`。
- 到期预览使用服务端结果，前端不计算自然月。
- 待办按服务端 `priority_rank` 排序。
- “已核对新微信号”和“已联系”是两个独立命令。
- 限时权益激活后不显示重置或延期操作。
- 反馈最多两轮补充，回复模板必选，补充说明最多 200 字。
- 图片单批最多 30 张且同系列、同模板；音频单批最多 300 个；批量任务最多 500 项。
- OCR 候选不得覆盖人工版本。
- 草稿允许不完整，发布检查必须完整。
- A23 仅允许启用 `scene_learning`。
- A25 只处理去标识化汇总，不提供个人轨迹导出。

## 10. 测试与验收

采用测试先行：先写能因缺少行为而失败的测试，再实现最小代码并运行全量回归。

### 单元与组件测试

- API client、请求头、错误映射和请求取消。
- 状态标签、正式权益操作矩阵、待办排序和日期展示。
- 敏感搜索不进入 URL。
- 脏表单、revision 冲突和二次确认。
- 上传数量、系列、模板和格式校验。
- `pending` 能力不发送未知请求且不显示成功提示。

### 页面与端到端测试

- 账号密码登录、退出和会话失效。
- 用户检索与用户详情。
- 正式权益预览和命令、限时权益命令。
- 反馈详情与处理命令。
- 上传、发布检查、发布和配置更新。
- A01–A26 的加载、空状态、错误、无权限和待接入状态。

### 视觉验收

- A01–A26 在 1440×900 对照交付 PNG。
- A01–A26 在 1280×800 检查布局和溢出。
- 覆盖长编号、长标题、空微信号、极限 SLA、最大任务数和错误信息。
- 所有键盘焦点可见，状态不只依赖颜色。

提交前执行：

```bash
pnpm check
pnpm test
pnpm build
```

最终阶段执行 Playwright 主链路和全量视觉检查。

## 11. 交付顺序

1. Element Plus、设计令牌、布局、登录、路由守卫、API client 和通用组件。
2. A01–A04 工作台、用户与联系方式。
3. A05–A13 权益、活动与消息中心。
4. A14–A16 反馈闭环。
5. A17–A24 内容、OCR、音频、发布和批量任务。
6. A25–A26 统计、配置、敏感数据和全量验收。

每阶段形成独立的中文提交记录。阶段提交不得包含下一阶段未验证的实现。

## 12. 完成标准

- 登录页与 A01–A26 路由全部存在并可直接访问或被守卫正确拦截。
- 可用接口完成真实接入；缺失接口均表现为明确的待接入能力。
- 业务约束、安全要求、错误状态和响应式行为均有自动化覆盖。
- `pnpm check`、`pnpm test`、`pnpm build` 通过。
- 1440×900 和 1280×800 的视觉验收完成。
- 所有改动已按阶段提交到 `main`，提交说明使用中文。
