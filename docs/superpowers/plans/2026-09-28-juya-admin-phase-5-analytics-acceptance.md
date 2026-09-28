# juya-admin 阶段五统计配置与全量验收 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 A25、A26，完成审计展示、全链路 E2E、1440×900 与 1280×800 视觉验收以及最终工程验证。

**Architecture:** A25 使用去标识化统计模型和 ECharts 展示，A26 使用乐观锁更新配置。最终以 Playwright 测试专用网络夹具覆盖真实交互形态，再进行一次集中视觉修正和一次确认。

**Tech Stack:** Vue 3.5、TypeScript、Element Plus、ECharts、dayjs、Vitest、Vue Test Utils、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-28-juya-admin-v1-design.md`

## Global Constraints

- 遵守 roadmap 中全部 Global Constraints。
- A25 只处理文档允许的匿名汇总指标，不接受用户 ID、微信号或个人轨迹维度。
- A26 配置更新必须携带 `expected_version`，409 时重新加载而不覆盖远端值。
- Playwright 网络夹具只存在于测试目录，不进入生产 bundle。
- 所有函数注释必须包含用途、每个 `@param` 和 `@returns`。

## Review Focus

- 统计返回未知指标或个人标识维度时必须拒绝渲染和导出。
- 比率图表必须同时显示分子、分母或口径说明。
- 配置 409 冲突必须保留本地草稿并显示远端版本差异。
- 1280×800 下图表、配置表和长错误信息不得造成页面级横向滚动。
- Playwright 截图前必须等待字体、请求、图表动画和布局稳定。

---

### Task 1: A25 匿名汇总统计

**Files:**

- Modify: `package.json`
- Create: `src/features/analytics/analytics-model.ts`
- Create: `src/features/analytics/analytics-model.spec.ts`
- Create: `src/features/analytics/analytics-adapter.ts`
- Create: `src/features/analytics/use-analytics.ts`
- Create: `src/features/analytics/use-analytics.spec.ts`
- Create: `src/components/metric-chart/metric-chart.vue`
- Create: `src/pages/analytics/analytics-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Produces: `validateAnalyticsRows(rows)`、`groupAnalyticsRows(rows, period)`、`createAnalyticsAdapter(client)`、`useAnalytics(adapter)`。
- Consumes: `/api/v1/admin/analytics/export` 和允许指标枚举。

- [ ] **Step 1: 写隐私和口径失败测试**

```ts
test('拒绝未知指标和包含个人标识的维度', () => {
  expect(validateAnalyticsRows([{ metric: 'USER_TRACE', dimension: 'user_1' }]).valid).toBe(false)
})

test('比率视图必须包含口径或分子分母', () => {
  expect(toRatioViewModel({ denominator: 0, numerator: 0 })).toMatchObject({
    denominator: 0,
    numerator: 0,
    rate: null
  })
})
```

- [ ] **Step 2: 验证失败并实现统计模型与 adapter**

Run: `pnpm test src/features/analytics/analytics-model.spec.ts src/features/analytics/use-analytics.spec.ts`

实现：

```ts
validateAnalyticsRows(rows: readonly AnalyticsRow[]): ValidationResult
groupAnalyticsRows(rows: readonly AnalyticsRow[], period: AnalyticsPeriod): AnalyticsSeries[]
toRatioViewModel(input: RatioInput): RatioViewModel
createAnalyticsAdapter(client: ApiClient): AnalyticsAdapter
useAnalytics(adapter: AnalyticsAdapter): AnalyticsController
```

- [ ] **Step 3: 安装 ECharts 并实现 A25**

图表按日、周、月切换；展示指标值、口径和匿名导出。图表容器使用 ResizeObserver 并在卸载时销毁实例。

- [ ] **Step 4: 验证并提交**

Run: `pnpm test src/features/analytics/analytics-model.spec.ts src/features/analytics/use-analytics.spec.ts`

```bash
git add package.json pnpm-lock.yaml src/components/metric-chart src/features/analytics src/pages/analytics src/router
git commit -m "feat: 完成匿名汇总统计与图表页面"
```

### Task 2: A26 系统配置、审核开关与审计事件

**Files:**

- Create: `src/features/system-config/system-config-model.ts`
- Create: `src/features/system-config/system-config-model.spec.ts`
- Create: `src/features/system-config/system-config-adapter.ts`
- Create: `src/features/system-config/use-system-config.ts`
- Create: `src/features/system-config/use-system-config.spec.ts`
- Create: `src/features/audit/audit-adapter.ts`
- Create: `src/components/audit-event-list/audit-event-list.vue`
- Create: `src/pages/settings/settings-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Produces: `validateSystemConfig()`、`createSystemConfigAdapter(client)`、`useSystemConfig(adapter)`、`createAuditAdapter(client)`。
- Consumes: settings 和 audit-events 接口。

- [ ] **Step 1: 写配置冲突失败测试**

```ts
test('配置更新携带 expected_version 且 409 后加载远端值但保留本地草稿', async () => {
  await controller.save(localDraft)
  expect(request.body.expected_version).toBe(3)
  expect(controller.conflict.value?.remoteVersion).toBe(4)
  expect(controller.draft.value).toEqual(localDraft)
})
```

另测 SLA、即将到期阈值和三个审核开关的输入范围。

- [ ] **Step 2: 验证失败并实现**

Run: `pnpm test src/features/system-config/system-config-model.spec.ts src/features/system-config/use-system-config.spec.ts`

实现：

```ts
validateSystemConfig(config: SystemConfigDraft): ValidationResult
createSystemConfigAdapter(client: ApiClient): SystemConfigAdapter
useSystemConfig(adapter: SystemConfigAdapter): SystemConfigController
createAuditAdapter(client: ApiClient): AuditAdapter
```

- [ ] **Step 3: 实现 A26 和审计列表**

配置保存前展示影响范围；冲突弹窗并列显示本地草稿和远端版本。审计列表只展示脱敏摘要、操作者、对象编号、动作、原因、Request ID 和时间。

- [ ] **Step 4: 验证并提交**

Run: `pnpm test src/features/system-config/system-config-model.spec.ts src/features/system-config/use-system-config.spec.ts`

```bash
git add src/components/audit-event-list src/features/audit src/features/system-config src/pages/settings src/router
git commit -m "feat: 完成系统配置审核开关与审计展示"
```

### Task 3: Playwright 主链路与敏感数据回归

**Files:**

- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/admin-api.ts`
- Create: `tests/e2e/auth.spec.ts`
- Create: `tests/e2e/users.spec.ts`
- Create: `tests/e2e/entitlements.spec.ts`
- Create: `tests/e2e/feedback.spec.ts`
- Create: `tests/e2e/content.spec.ts`
- Create: `tests/e2e/settings.spec.ts`

**Interfaces:**

- Consumes: 全部已实现路由和 API client。
- Produces: `pnpm test:e2e`，只在测试进程注册的 API route fixtures。

- [ ] **Step 1: 添加 Playwright 并写失败 E2E**

覆盖密码/TOTP、401 清理、微信号搜索 URL、正式权益 preview/confirm、反馈处理、上传取消、发布 warning 确认和配置 409。

- [ ] **Step 2: 运行测试并验证至少一条因流程未满足而失败**

Run: `pnpm test:e2e --project=chromium`

Expected: FAIL，失败原因属于真实交互差距而不是环境错误。

- [ ] **Step 3: 修复流程接缝并补充函数注释**

只修复 E2E 暴露的跨 feature 接口、焦点、等待和状态清理问题，不改变已确认业务范围。

- [ ] **Step 4: 运行 E2E 并提交**

Run: `pnpm test:e2e --project=chromium`

Expected: PASS。

```bash
git add package.json pnpm-lock.yaml playwright.config.ts tests/e2e src
git commit -m "feat: 完成管理后台核心链路端到端测试"
```

### Task 4: A01–A26 视觉回归与可访问性验收

**Files:**

- Create: `tests/visual/admin-pages.visual.spec.ts`
- Create: `tests/visual/page-manifest.ts`
- Create: `tests/visual/page-manifest.spec.ts`
- Create: `.impeccable/review/` screenshots during verification
- Modify: `vitest.config.ts`
- Modify: page/component SCSS files identified by the first inspection round

**Interfaces:**

- Produces: 26 个页面在 1440×900 和 1280×800 的有效截图、可访问性与溢出断言。
- Consumes: A01–A26 PNG、设计令牌、Playwright 测试 fixtures。

- [ ] **Step 1: 写视觉清单失败测试**

```ts
test('视觉清单覆盖 A01 到 A26 且每页包含两个验收视口', () => {
  expect(pageManifest.map((page) => page.id)).toEqual(expectedA01ToA26)
  expect(pageManifest.every((page) => page.viewports.length === 2)).toBe(true)
})
```

每页另断言 `document.documentElement.scrollWidth === document.documentElement.clientWidth`，所有图标按钮有可访问名称。

- [ ] **Step 2: 运行清单测试并确认失败**

Run: `pnpm test tests/visual/page-manifest.spec.ts`

Expected: FAIL，提示清单或覆盖项不存在。

- [ ] **Step 3: 完成第一轮集中截图与缺陷清单**

在 1440×900 和 1280×800 一次性捕获 A01–A26。逐张确认文件有效，再按设计稿集中记录侧栏、顶栏、面板、表格、长文本、空状态和待接入状态差异。

- [ ] **Step 4: 批量修复并完成第二轮确认**

只进行一批视觉修复和一次确认截图。运行 Impeccable detector；修复机械问题并把剩余项目交给 finish reviewer。

- [ ] **Step 5: 提交视觉修复**

```bash
git add src tests/visual
git commit -m "feat: 完成管理后台全页面视觉与可访问性验收"
```

### Task 5: 最终质量门禁、文档化与提交核对

**Files:**

- Modify: `README.md`
- Create or update: `DESIGN.md`
- Create or update: `.impeccable/design.json`
- Modify: only files required by verified final findings

**Interfaces:**

- Consumes: 全部实施计划、设计文档、截图、detector 和 finish reviewer 结果。
- Produces: 可复现的开发说明、设计系统记录和最终验证证据。

- [ ] **Step 1: 运行完整质量门禁**

Run: `pnpm check && pnpm test && pnpm build && pnpm test:e2e --project=chromium`

Expected: 全部退出码为 0，无 warning 和失败测试。

- [ ] **Step 2: 运行全量需求核对**

逐项核对登录、A01–A26、真实接口、待接入状态、敏感数据、函数注释、1440×900、1280×800 和中文提交记录。

- [ ] **Step 3: 完成 Impeccable 终审与设计文档化**

将原始请求、确认项、截图、方向约束和 detector 结果交给 finish reviewer；按 verdict 处理后生成 `DESIGN.md` 与 `.impeccable/design.json`。

- [ ] **Step 4: 更新 README 并提交**

README 记录环境、安装、开发、契约生成、检查、E2E 和接口待接入说明。

```bash
git add README.md DESIGN.md .impeccable src tests
git commit -m "feat: 完成管理后台交付文档与最终验收"
```

- [ ] **Step 5: 验证仓库状态**

Run: `git status --short --branch && git log --oneline --decorate -20`

Expected: 工作区干净，`main` 包含完整中文阶段提交记录。
