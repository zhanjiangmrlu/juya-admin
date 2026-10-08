# 用户与权益页面 Figma 交接

日期：2026-10-08。状态：READY_FOR_INTEGRATION。当前 `main`，开发对话 1 未提交、未暂存、未修改公共布局、组件、路由、tokens 或业务控制器。

## 页面与实现

Figma 文件：`evoGqXQ4pI3Q3cdLpc6NOc`。下列八个节点均已读取 `get_design_context` 高精度代码与 screenshot；初次部分请求出现 `Transport closed`，重试成功后才实施。

| 页面             | 节点     | 路由                               | 文件与改动                                                                                                                                                     |
| ---------------- | -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A02 用户列表     | 2538:17  | `/users`                           | `src/pages/users/user-list-page.vue`：浅绿筛选卡、表格卡、联系方式可见范围提示；保留微信号 POST 搜索、全部原有筛选、分页和更正申请入口。                       |
| A03 用户详情     | 2538:103 | `/users/:userId`                   | `src/pages/users/user-detail-page.vue`：690:452 比例身份学习与联系审计双栏；保留动态头像、学习统计、敏感复制、联系状态与核对按钮、关联记录。                   |
| A04 联系资料更正 | 2538:164 | `/contacts/corrections/:id`        | `src/pages/contacts/contact-correction-page.vue`：更正申请字段、核对处理审计双栏、管理提醒；申请对象信息移至副文案，保留时间线、批准、拒绝和二次确认。         |
| A05 权益中心     | 2538:225 | `/entitlements`                    | `src/pages/entitlements/entitlement-center-page.vue`：筛选卡、表格卡、操作说明；将期限与活动版本等原有字段组合展示，固定右侧操作列，保留全部服务端筛选和分页。 |
| A06 授予正式包   | 2538:311 | `/entitlements/formal/grant`       | `src/pages/entitlements/formal-grant-page.vue`：630px 表单卡、455px 提交核对卡、提交前确认提示；保留内容包分页、操作类型、期限、服务端预览、原因和冲突恢复。   |
| A07 开通限时权益 | 2538:374 | `/entitlements/limited/grant`      | `src/pages/entitlements/limited-grant-page.vue`：开通表单与核对双栏，动态容量说明；保留活动分页、版本详情、容量限制、二次确认和冲突后重新读取。                |
| A08 正式权益操作 | 2538:437 | `/entitlements/formal/:id/action`  | `src/pages/entitlements/formal-action-page.vue`：正式权益只读字段与操作确认双栏；对象、版本在副文案展示，保留允许操作、目标期限、服务端预览和对象身份校验。    |
| A09 限时权益操作 | 2538:498 | `/entitlements/limited/:id/action` | `src/pages/entitlements/limited-action-page.vue`：限时状态与操作双栏；保留活动、用户、版本、补救次数、启动截止、到期信息、允许操作和幂等重试。                 |

所有八个 Vue 的 `<script setup>` 与实施前 HEAD 字节比较一致。修改限于模板与 scoped SCSS。复用 Element Plus、DataTable、AppPagination、SensitiveValue、ConfirmDialog、StatusTag 与既有 UserRelatedRecords；未添加依赖。

设计没有独立静态图片或 SVG 资产；因此没有需要下载的设计资产，也没有临时 Figma 资产 URL。用户头像仍来自接口，设计截图没有作为页面使用。

## 验证结果

- `pnpm test src/pages/users src/pages/contacts src/pages/entitlements src/features/users src/features/contacts src/features/entitlements --maxWorkers=2`：15 文件、55/55 通过。实施前与实施后均通过。
- `pnpm exec vue-tsc --noEmit -p tsconfig.app.json`：退出码 0。
- `pnpm exec prettier src/pages/users/*.vue src/pages/contacts/*.vue src/pages/entitlements/*.vue tests/e2e/users-figma.spec.ts --check`：通过。
- `pnpm exec eslint src/pages/users/*.vue src/pages/contacts/*.vue src/pages/entitlements/*.vue tests/e2e/users-figma.spec.ts --max-warnings=0`：通过。
- `pnpm exec stylelint src/pages/users/*.vue src/pages/contacts/*.vue src/pages/entitlements/*.vue --max-warnings=0`：通过。
- `git diff --check -- src/pages/users src/pages/contacts src/pages/entitlements tests/e2e/users-figma.spec.ts`：通过。
- 独立 Vite 端口 `16181`，复用 `tests/e2e/fixtures/admin-api.ts` 模拟 API。浏览器相关 9/9 通过：敏感 POST 搜索、联系筛选与审计复制、更正批准与 409、正式权益预览与原因确认、限时同对象幂等重试、活动详情冲突恢复、两种视口的八页验收。
- 最后仅调整表单分页控件宽度及低高度视口卡片尺寸，重新运行两种视口截图验收 2/2 通过。八页均无文档级横向溢出；1280px 的宽表格内部可横向滚动，操作列固定可访问。

新增相关测试：`tests/e2e/users-figma.spec.ts`。检查真实页面入口、可执行按钮、加载数据、接口请求边界、文档横向溢出，并截图；没有新增样式镜像断言。截图前等待有限动画完成，避免记录下拉框和导航过渡中间态。

### 浏览器命令

完整可复现配置保存在仓库外：`D:/个人/juya/figma-evidence-20261008/users/playwright.config.cjs`。在 `juya-admin` 执行：

```powershell
pnpm exec playwright test --config 'D:/个人/juya/figma-evidence-20261008/users/playwright.config.cjs' --grep '完整微信号|联系状态筛选|联系更正列表|更正决定|正式权益先|用户与权益八页|A09 same-object|A07 conflict'
```

只刷新八页截图：

```powershell
pnpm exec playwright test --config 'D:/个人/juya/figma-evidence-20261008/users/playwright.config.cjs' --grep '用户与权益八页'
```

一轮验证原本输出到 `test-results/figma-users-20261008`，被并行运行清理，出现 `browserContext.close: ENOENT` trace 文件错误。改用下面的仓库外独立目录后重跑通过。请使用最终证据，不使用已被清理的旧目录。

## 截图证据

证据根目录：`D:/个人/juya/figma-evidence-20261008/users/browser-run`，不会被仓库默认 Playwright 输出清理。

| 页面 | 1440×900                                                 | 1280×800                                                 |
| ---- | -------------------------------------------------------- | -------------------------------------------------------- |
| A02  | `users-figma-用户与权益八页浏览器验收-1440/A02-1440.png` | `users-figma-用户与权益八页浏览器验收-1280/A02-1280.png` |
| A03  | `users-figma-用户与权益八页浏览器验收-1440/A03-1440.png` | `users-figma-用户与权益八页浏览器验收-1280/A03-1280.png` |
| A04  | `users-figma-用户与权益八页浏览器验收-1440/A04-1440.png` | `users-figma-用户与权益八页浏览器验收-1280/A04-1280.png` |
| A05  | `users-figma-用户与权益八页浏览器验收-1440/A05-1440.png` | `users-figma-用户与权益八页浏览器验收-1280/A05-1280.png` |
| A06  | `users-figma-用户与权益八页浏览器验收-1440/A06-1440.png` | `users-figma-用户与权益八页浏览器验收-1280/A06-1280.png` |
| A07  | `users-figma-用户与权益八页浏览器验收-1440/A07-1440.png` | `users-figma-用户与权益八页浏览器验收-1280/A07-1280.png` |
| A08  | `users-figma-用户与权益八页浏览器验收-1440/A08-1440.png` | `users-figma-用户与权益八页浏览器验收-1280/A08-1280.png` |
| A09  | `users-figma-用户与权益八页浏览器验收-1440/A09-1440.png` | `users-figma-用户与权益八页浏览器验收-1280/A09-1280.png` |

## 设计兼容与剩余验收边界

- 未完成的归属页面：无。提交、仓库全量检查、构建和最终公共壳验收由集成对话处理。
- 设计示例中的导出用户、限时开通保存草稿没有现有业务事件；没有新增空操作按钮或改变业务范围。A02 保留更正申请入口，A05 保留正式与限时两个独立入口。
- A04 服务端提供的是“重置自助修改机会”申请，当前 DTO 没有申请的新微信号。页面显示实际当前微信号与申请原因，保留批准不会直接改写微信号的提示，未伪造设计示例中的新微信号。
- A06 的生效和到期时间只在服务端预览返回后展示；没有用设计日期替换真实数据，也没有增加前端日期推算。A07 启动窗口、时长与容量来自选定版本。
- 页面保留设计之外已经存在的账号状态、资料完整度、分组、时间筛选、版本号、学习统计和关联记录。因此列表过滤区、行高和真实数据文案不会与设计的五条静态示例逐项相同。
- 公共侧栏、标题、副标题、折叠与导航动画归集成所有。本对话没有调整截图中公共导航的展开状态或标题副文案。
- 既有 `tests/e2e/entitlements-campaigns.spec.ts` 的整组 A05–A12 视口验收仍指定页面标题 `level: 2`；公共标题已移入 h1，集成应随公共壳统一更新这一旧断言。本对话只执行其 A07/A09 归属交互用例，没有修改涉及活动页的公共验收断言。
- 浏览器采用模拟 API，证明页面与既有请求/事件连接以及布局可用；未执行真实后台权益写入、生产发布或真实服务验收。
