# juya-admin 阶段一基础框架与用户运营 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Element Plus 管理端框架、认证与 API 基础设施，并交付 A01–A04 工作台和用户运营页面。

**Architecture:** 先建立可复用设计令牌、路由、能力注册表和统一 API client，再接入登录、工作台和用户查询接口。联系资料命令因接口缺失以明确的 `pending` 状态交付。

**Tech Stack:** Vue 3.5、TypeScript、Vite、Vue Router、Pinia、Element Plus、SCSS、Vitest、Vue Test Utils、dayjs、openapi-typescript。

**Spec:** `docs/superpowers/specs/2026-09-28-juya-admin-v1-design.md`

## Global Constraints

- 遵守 roadmap 中全部 Global Constraints。
- 生成契约来自 `openapi/admin-api.json`，输出到 `src/shared/contracts/generated/admin-api.d.ts`，禁止手改生成文件。
- CSRF token 仅保存在内存；认证 Cookie 由浏览器管理。
- 微信号搜索使用 POST，筛选 URL 只能记录 `hasSensitiveSearch=true`。
- 所有函数注释必须说明用途、每个 `@param` 和 `@returns`。

## Review Focus

- 错误 JSON 缺少 `request_id` 时仍生成安全的通用提示。
- 连续输入筛选条件时旧请求被取消，取消不得显示为错误。
- 微信号为空、包含空格或超过 64 字符时不发送请求。
- 刷新敏感详情路由时，认证探测失败必须先清理状态再跳转登录页。
- 1280×800 下侧栏、筛选栏和表格不会造成页面级横向滚动。

---

### Task 1: Element Plus、设计令牌与函数注释门禁

**Files:**

- Modify: `package.json`
- Modify: `eslint.config.mjs`
- Modify: `src/main.ts`
- Modify: `src/styles/global.scss`
- Create: `src/styles/tokens.scss`
- Create: `src/styles/element-plus.scss`
- Create: `src/styles/theme-contract.spec.ts`

**Interfaces:**

- Consumes: 当前 Vite/Vue 应用入口。
- Produces: 全局 Element Plus 注册、`--juya-*` 设计令牌、命名函数 TSDoc/JSDoc 检查规则。

- [ ] **Step 1: 写失败测试**

```ts
test('定义后台核心颜色和布局令牌', () => {
  expect(tokens).toContain('--juya-sidebar-width: 222px')
  expect(tokens).toContain('--juya-color-primary: #2f7d61')
  expect(tokens).toContain('--juya-panel-radius: 8px')
})
```

- [ ] **Step 2: 验证测试因令牌文件缺失而失败**

Run: `pnpm test src/styles/theme-contract.spec.ts`

Expected: FAIL，提示无法读取 `tokens.scss` 或缺少指定令牌。

- [ ] **Step 3: 安装并配置依赖**

添加 `element-plus`、`@element-plus/icons-vue`、`dayjs`、`@vue/test-utils`、`openapi-typescript` 和函数注释检查所需 ESLint 插件。配置只检查项目拥有的命名函数与方法，要求参数描述和返回值描述；测试回调及第三方类型声明不强制注释。

- [ ] **Step 4: 实现主题文件并注册 Element Plus**

定义设计稿中的侧栏、页面底色、面板、边框、状态色、控件高度和断点令牌；`main.ts` 只负责安装 Pinia、Router 和 Element Plus。

- [ ] **Step 5: 运行聚焦验证**

Run: `pnpm test src/styles/theme-contract.spec.ts && pnpm lint && pnpm lint:style`

Expected: PASS，ESLint 对缺少参数注释的命名函数报错。

- [ ] **Step 6: 提交**

```bash
git add package.json pnpm-lock.yaml eslint.config.mjs src/main.ts src/styles
git commit -m "feat: 配置管理后台组件库与设计令牌"
```

### Task 2: OpenAPI 契约、能力注册表与统一 API client

**Files:**

- Create: `openapi/admin-api.json`
- Create: `src/shared/contracts/generated/admin-api.d.ts`
- Create: `src/shared/capabilities/capability-registry.ts`
- Create: `src/shared/capabilities/capability-registry.spec.ts`
- Create: `src/shared/errors/api-error.ts`
- Create: `src/services/api/api-client.ts`
- Create: `src/services/api/api-client.spec.ts`
- Modify: `package.json`

**Interfaces:**

- Produces: `CapabilityKey`、`CapabilityState`、`getCapability(key)`、`ApiClient.request<T>(options)`、`ApiError`、`createRequestId()`、`createIdempotencyKey()`。
- Consumes: 当前 `juya-admin-api` OpenAPI 快照。

- [ ] **Step 1: 写能力边界失败测试**

```ts
test('将用户查询标记为可用并将联系更正命令标记为待接入', () => {
  expect(getCapability('users.list')).toBe('available')
  expect(getCapability('contacts.correction-command')).toBe('pending')
})
```

- [ ] **Step 2: 写 API client 失败测试**

```ts
test('写请求携带 CSRF、Request ID 和指定幂等键', async () => {
  await client.request({ idempotencyKey: 'idem-1', method: 'POST', path: '/command' })
  expect(fetchHeaders).toMatchObject({
    'X-CSRF-Token': 'csrf-1',
    'X-Idempotency-Key': 'idem-1'
  })
})
```

同时覆盖 401、403、409、422、429、5xx、AbortError 和缺失 `request_id`。

- [ ] **Step 3: 验证测试失败**

Run: `pnpm test src/shared/capabilities/capability-registry.spec.ts src/services/api/api-client.spec.ts`

Expected: FAIL，提示模块或导出不存在。

- [ ] **Step 4: 生成契约并实现接口**

从相邻后端工程导出 OpenAPI 快照，再运行 `openapi-typescript`。实现：

```ts
getCapability(key: CapabilityKey): CapabilityState
createRequestId(): string
createIdempotencyKey(): string
createApiClient(options: ApiClientOptions): ApiClient
```

`ApiClient` 默认使用 `credentials: 'include'`，只对写请求注入 CSRF；AbortError 原样识别为取消而不是业务错误。

- [ ] **Step 5: 运行聚焦验证**

Run: `pnpm test src/shared/capabilities/capability-registry.spec.ts src/services/api/api-client.spec.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add openapi package.json pnpm-lock.yaml src/services src/shared
git commit -m "feat: 建立管理端接口契约与请求基础设施"
```

### Task 3: 管理端布局、完整路由与登录流程

**Files:**

- Modify: `src/App.vue`
- Modify: `src/router/index.ts`
- Delete: `src/views/home-view.vue`
- Create: `src/app/route-guard.ts`
- Create: `src/app/route-guard.spec.ts`
- Create: `src/layouts/admin-layout/admin-layout.vue`
- Create: `src/layouts/admin-layout/admin-layout.spec.ts`
- Create: `src/pages/login/login-page.vue`
- Create: `src/features/auth/auth-adapter.ts`
- Create: `src/features/auth/auth-store.ts`
- Create: `src/features/auth/auth-store.spec.ts`
- Create: `src/components/pending-capability/pending-capability.vue`
- Create: `src/pages/capability-placeholder/capability-placeholder-page.vue`

**Interfaces:**

- Consumes: `ApiClient`、`getCapability`。
- Produces: `useAuthStore()`、`createAuthAdapter(client)`、`installRouteGuard(router, authStore)`、A01–A26 路由元数据。

- [ ] **Step 1: 写认证与路由失败测试**

```ts
test('密码成功后进入 TOTP 步骤且不持久化密码', async () => {
  await store.submitPassword({ password: 'secret', username: 'admin' })
  expect(store.step).toBe('totp')
  expect(JSON.stringify(store.$state)).not.toContain('secret')
})

test('认证探测返回 401 时清空状态并跳转登录页', async () => {
  await guard(toSensitiveRoute)
  expect(store.clearSensitiveState).toHaveBeenCalled()
  expect(result).toEqual({ name: 'login' })
})

test('1280 宽度下布局不产生页面级横向滚动', () => {
  setViewportWidth(1280)
  expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth)
})
```

同时断言 A01–A26 共 26 个页面编号均存在、六个一级导航名称和顺序固定。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test src/features/auth/auth-store.spec.ts src/app/route-guard.spec.ts src/layouts/admin-layout/admin-layout.spec.ts`

Expected: FAIL，提示认证 store、守卫或布局不存在。

- [ ] **Step 3: 实现认证 adapter 与 store**

实现：

```ts
createAuthAdapter(client: ApiClient): AuthAdapter
useAuthStore(): AuthStore
installRouteGuard(router: Router, authStore: AuthStore): void
```

密码接口只保留 challenge ID；TOTP 成功后保存 CSRF token 和过期时间；刷新时通过受保护的设置读取接口探测会话；退出和 401 清理内存。

- [ ] **Step 4: 实现登录页、布局和完整路由**

登录页使用 `ElForm` 完成密码与 TOTP 两步流程。布局复刻 222px 深绿侧栏、66px 顶栏、基础能力分组和折叠状态。尚未实现的页面暂由 `CapabilityPlaceholderPage` 承载，不显示模拟数据。

- [ ] **Step 5: 运行聚焦验证**

Run: `pnpm test src/features/auth/auth-store.spec.ts src/app/route-guard.spec.ts src/layouts/admin-layout/admin-layout.spec.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/App.vue src/app src/components src/features/auth src/layouts src/pages src/router
git commit -m "feat: 完成管理后台布局路由与登录流程"
```

### Task 4: A01 工作台与 A13 待办基础组件

**Files:**

- Create: `src/features/dashboard/dashboard-adapter.ts`
- Create: `src/features/dashboard/use-dashboard.ts`
- Create: `src/features/dashboard/use-dashboard.spec.ts`
- Create: `src/features/work-items/work-item-model.ts`
- Create: `src/features/work-items/work-item-model.spec.ts`
- Create: `src/components/status-tag/status-tag.vue`
- Create: `src/components/data-table/data-table.vue`
- Create: `src/pages/dashboard/dashboard-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Consumes: `ApiClient`、生成的 `DashboardSnapshot` 和 `WorkItem` 类型。
- Produces: `createDashboardAdapter(client)`、`useDashboard()`、`toWorkItemViewModel(item)`。

- [ ] **Step 1: 写失败测试**

```ts
test('按服务端 priority_rank 顺序展示紧急待办且将学习中即将结束放入普通提醒', () => {
  expect(grouped.urgent.map((item) => item.kind)).toEqual(['FEEDBACK_OVERDUE', 'USER_SUPPLIED'])
  expect(grouped.informational[0]?.kind).toBe('ACTIVE_ENTITLEMENT_EXPIRING')
})
```

另测 30 秒轮询、页面隐藏时暂停和 AbortError 不显示错误。

- [ ] **Step 2: 验证测试失败**

Run: `pnpm test src/features/dashboard/use-dashboard.spec.ts src/features/work-items/work-item-model.spec.ts`

Expected: FAIL，提示 dashboard 模块不存在。

- [ ] **Step 3: 实现 dashboard adapter 与 composable**

实现：

```ts
createDashboardAdapter(client: ApiClient): DashboardAdapter
useDashboard(adapter: DashboardAdapter): DashboardController
groupWorkItems(items: WorkItemDto[]): WorkItemGroups
```

轮询间隔固定 30 秒；不对服务端优先级重新排序。

- [ ] **Step 4: 实现 A01 页面**

使用 `ElCard`、`ElTable` 和业务状态组件复刻工作台；数字卡跳转携带稳定非敏感筛选参数。

- [ ] **Step 5: 运行聚焦测试并提交**

Run: `pnpm test src/features/dashboard/use-dashboard.spec.ts src/features/work-items/work-item-model.spec.ts`

```bash
git add src/components src/features/dashboard src/features/work-items src/pages/dashboard src/router
git commit -m "feat: 完成工作台指标与待办展示"
```

### Task 5: A02–A04 用户、详情与联系资料状态

**Files:**

- Create: `src/features/users/user-model.ts`
- Create: `src/features/users/user-adapter.ts`
- Create: `src/features/users/use-user-list.ts`
- Create: `src/features/users/use-user-list.spec.ts`
- Create: `src/features/users/use-user-detail.ts`
- Create: `src/features/users/use-user-detail.spec.ts`
- Create: `src/features/contacts/contact-capabilities.ts`
- Create: `src/features/contacts/contact-capabilities.spec.ts`
- Create: `src/components/sensitive-value/sensitive-value.vue`
- Create: `src/pages/users/user-list-page.vue`
- Create: `src/pages/users/user-detail-page.vue`
- Create: `src/pages/contacts/contact-correction-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Consumes: `ApiClient`、`UserProjection`、`UserDetail`、`getCapability`。
- Produces: `createUserAdapter(client)`、`useUserList(adapter)`、`useUserDetail(adapter, userId)`、`createSensitiveSearchPayload(value)`。

- [ ] **Step 1: 写敏感搜索失败测试**

```ts
test('微信号搜索使用 POST 且 URL 不包含明文', async () => {
  await controller.searchByWechat('wx_example')
  expect(request.method).toBe('POST')
  expect(router.currentRoute.value.query).toEqual({ hasSensitiveSearch: 'true' })
  expect(router.currentRoute.value.fullPath).not.toContain('wx_example')
})
```

另测空白、超过 64 字符、旧请求取消、用户详情上游降级以及联系命令 `pending` 时零请求。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test src/features/users/use-user-list.spec.ts src/features/users/use-user-detail.spec.ts src/features/contacts/contact-capabilities.spec.ts`

Expected: FAIL，提示用户 feature 不存在。

- [ ] **Step 3: 实现用户 adapter、列表和详情 composable**

实现：

```ts
createUserAdapter(client: ApiClient): UserAdapter
useUserList(adapter: UserAdapter): UserListController
useUserDetail(adapter: UserAdapter, userId: MaybeRef<string>): UserDetailController
createSensitiveSearchPayload(value: string): WechatSearchRequest
```

用户详情各区块使用独立状态；联系方式上游降级不阻塞学习、权益和反馈摘要。

- [ ] **Step 4: 实现 A02–A04 页面**

A02 接入用户查询和微信号 POST 搜索；A03 接入当前可用详情字段并显示未提供区块的待接入状态；A04 完整复刻设计稿但批准、拒绝和核对命令禁用并说明缺失接口。

- [ ] **Step 5: 运行阶段全量验证**

Run: `pnpm check && pnpm test && pnpm build`

Expected: 全部通过，无 warning。

- [ ] **Step 6: 提交**

```bash
git add src/components src/features/contacts src/features/users src/pages/contacts src/pages/users src/router
git commit -m "feat: 完成用户管理与联系资料页面"
```
