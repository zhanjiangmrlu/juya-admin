# juya-admin 阶段二权益活动与消息中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 A05–A13，真实接入正式权益、限时权益和待办接口，并为缺失的活动管理接口提供完整待接入页面。

**Architecture:** 正式权益和限时权益分别建立状态矩阵与 adapter，共用二次确认和幂等提交组件。活动列表、编辑、版本和容量页面只呈现文档确定的字段与规则，写操作在 capability 为 `pending` 时保持禁用。

**Tech Stack:** Vue 3.5、TypeScript、Element Plus、Pinia、dayjs、Vitest、Vue Test Utils。

**Spec:** `docs/superpowers/specs/2026-09-28-juya-admin-v1-design.md`

## Global Constraints

- 遵守 roadmap 中全部 Global Constraints。
- 正式权益期限只能是 `MONTH_1`、`MONTH_2`、`MONTH_3`、`MONTH_6`、`MONTH_12`、`PERMANENT`。
- 自然月和操作后到期时间只展示服务端 preview 结果，前端不得计算。
- 每个命令提交期间复用当前幂等键；命令完成或表单实质变化后生成新键。
- 所有函数注释必须包含用途、每个 `@param` 和 `@returns`。

## Review Focus

- 永久权益不得显示续期或延期入口。
- 已激活限时权益不得显示补救入口。
- 容量已满、用户注销期和活动不可开通时提交按钮必须禁用并显示服务端原因。
- 409 状态冲突保留用户输入并提供刷新动作。
- 待办按服务端顺序展示，颜色不改变排序。

---

### Task 1: 通用状态标签、二次确认与幂等命令控制器

**Files:**

- Create: `src/components/confirm-dialog/confirm-dialog.vue`
- Create: `src/components/confirm-dialog/confirm-dialog.spec.ts`
- Create: `src/shared/commands/idempotent-command.ts`
- Create: `src/shared/commands/idempotent-command.spec.ts`
- Modify: `src/components/status-tag/status-tag.vue`

**Interfaces:**

- Consumes: `createIdempotencyKey()`、`ApiError`。
- Produces: `useIdempotentCommand<TInput, TResult>(execute)`、统一 `ConfirmDialog` props/emits。

- [ ] **Step 1: 写失败测试**

```ts
test('重复提交同一操作时复用幂等键并在成功后轮换', async () => {
  await controller.submit(input)
  await controller.retry()
  expect(keysDuringSameOperation).toEqual(['key-1', 'key-1'])
  controller.reset(input2)
  expect(controller.idempotencyKey.value).toBe('key-2')
})
```

另测确认弹窗展示对象编号、前后状态、影响范围和必填原因。

- [ ] **Step 2: 验证测试失败**

Run: `pnpm test src/shared/commands/idempotent-command.spec.ts src/components/confirm-dialog/confirm-dialog.spec.ts`

Expected: FAIL，提示命令控制器或组件不存在。

- [ ] **Step 3: 实现命令控制器和确认弹窗**

实现：

```ts
useIdempotentCommand<TInput, TResult>(execute: CommandExecutor<TInput, TResult>): IdempotentCommandController<TInput, TResult>
```

状态标签同时输出文字、图标和状态类，不只依赖颜色。

- [ ] **Step 4: 验证并提交**

Run: `pnpm test src/shared/commands/idempotent-command.spec.ts src/components/confirm-dialog/confirm-dialog.spec.ts`

```bash
git add src/components/confirm-dialog src/components/status-tag src/shared/commands
git commit -m "feat: 完成高风险操作确认与幂等控制"
```

### Task 2: A05、A06、A08 正式权益

**Files:**

- Create: `src/features/entitlements/formal-entitlement-model.ts`
- Create: `src/features/entitlements/formal-entitlement-model.spec.ts`
- Create: `src/features/entitlements/formal-entitlement-adapter.ts`
- Create: `src/features/entitlements/use-formal-entitlement-command.ts`
- Create: `src/features/entitlements/use-formal-entitlement-command.spec.ts`
- Create: `src/pages/entitlements/entitlement-center-page.vue`
- Create: `src/pages/entitlements/formal-grant-page.vue`
- Create: `src/pages/entitlements/formal-action-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Produces: `FORMAL_TERMS`、`getFormalOperations(status, term)`、`createFormalEntitlementAdapter(client)`、`useFormalEntitlementCommand(adapter)`。
- Consumes: `ApiClient`、`useIdempotentCommand`、OpenAPI 正式权益模型。

- [ ] **Step 1: 写期限和状态矩阵失败测试**

```ts
test('只暴露六个正式权益期限且永久权益不允许续期', () => {
  expect(FORMAL_TERMS).toEqual([
    'MONTH_1',
    'MONTH_2',
    'MONTH_3',
    'MONTH_6',
    'MONTH_12',
    'PERMANENT'
  ])
  expect(getFormalOperations('ACTIVE', 'PERMANENT')).not.toContain('RENEW')
})
```

另测 preview 必须成功后才能打开确认弹窗，409 时保留表单。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test src/features/entitlements/formal-entitlement-model.spec.ts src/features/entitlements/use-formal-entitlement-command.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 实现正式权益模型、adapter 和 composable**

实现：

```ts
getFormalOperations(status: FormalStatus, term: EntitlementTerm): readonly EntitlementOperation[]
createFormalEntitlementAdapter(client: ApiClient): FormalEntitlementAdapter
useFormalEntitlementCommand(adapter: FormalEntitlementAdapter): FormalEntitlementCommandController
```

- [ ] **Step 4: 实现 A05、A06、A08**

A05 的权益列表接口待接入，页面展示真实能力边界；A06/A08 接入 preview 和命令接口，确认区显示服务端返回的生效及到期结果。

- [ ] **Step 5: 验证并提交**

Run: `pnpm test src/features/entitlements/formal-entitlement-model.spec.ts src/features/entitlements/use-formal-entitlement-command.spec.ts`

```bash
git add src/features/entitlements src/pages/entitlements src/router
git commit -m "feat: 完成正式权益授予与操作页面"
```

### Task 3: A07、A09 限时权益

**Files:**

- Create: `src/features/entitlements/limited-entitlement-model.ts`
- Create: `src/features/entitlements/limited-entitlement-model.spec.ts`
- Create: `src/features/entitlements/limited-entitlement-adapter.ts`
- Create: `src/features/entitlements/use-limited-entitlement-command.ts`
- Create: `src/features/entitlements/use-limited-entitlement-command.spec.ts`
- Create: `src/pages/entitlements/limited-grant-page.vue`
- Create: `src/pages/entitlements/limited-action-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Produces: `getLimitedOperations(entitlement)`、`createLimitedEntitlementAdapter(client)`、`useLimitedEntitlementCommand(adapter)`。
- Consumes: OpenAPI 限时权益模型与统一幂等命令控制器。

- [ ] **Step 1: 写状态矩阵失败测试**

```ts
test('已激活限时权益不提供补救且待开始权益最多提供一次延期', () => {
  expect(getLimitedOperations(activeEntitlement)).not.toContain('REMEDY')
  expect(getLimitedOperations(pendingEntitlement)).toContain('EXTEND_START_DEADLINE')
  expect(getLimitedOperations(remediedPendingEntitlement)).not.toContain('EXTEND_START_DEADLINE')
})
```

另测容量满等 409 错误映射为禁用原因。

- [ ] **Step 2: 验证失败后实现模型与 adapter**

Run: `pnpm test src/features/entitlements/limited-entitlement-model.spec.ts src/features/entitlements/use-limited-entitlement-command.spec.ts`

实现：

```ts
getLimitedOperations(entitlement: LimitedEntitlement): readonly LimitedOperation[]
createLimitedEntitlementAdapter(client: ApiClient): LimitedEntitlementAdapter
useLimitedEntitlementCommand(adapter: LimitedEntitlementAdapter): LimitedEntitlementCommandController
```

- [ ] **Step 3: 实现 A07、A09 并验证**

A07 接入授予命令并呈现活动版本、启动截止和容量信息；活动版本查询缺失时表单保持待接入。A09 接入补救、暂停、恢复和撤销命令。

Run: `pnpm test src/features/entitlements/limited-entitlement-model.spec.ts src/features/entitlements/use-limited-entitlement-command.spec.ts`

- [ ] **Step 4: 提交**

```bash
git add src/features/entitlements src/pages/entitlements src/router
git commit -m "feat: 完成限时权益授予与状态操作"
```

### Task 4: A10、A11、A12 活动管理待接入页面

**Files:**

- Create: `src/features/campaigns/campaign-model.ts`
- Create: `src/features/campaigns/campaign-model.spec.ts`
- Create: `src/features/campaigns/campaign-adapter.ts`
- Create: `src/pages/campaigns/campaign-list-page.vue`
- Create: `src/pages/campaigns/campaign-edit-page.vue`
- Create: `src/pages/campaigns/campaign-version-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Produces: `getCampaignFieldAccess(campaign)`、`validateCapacityLimit(currentCount, nextLimit)`、`createCampaignAdapter()`。
- Consumes: capability registry。

- [ ] **Step 1: 写活动锁定规则失败测试**

```ts
test('首次开通后锁定模式场景顺序和启动窗口但允许合法提高容量', () => {
  expect(getCampaignFieldAccess(lockedCampaign).duration).toBe('readonly')
  expect(getCampaignFieldAccess(lockedCampaign).capacity).toBe('editable')
  expect(validateCapacityLimit(42, 41)).toEqual({ valid: false })
})
```

- [ ] **Step 2: 验证失败并实现活动模型**

Run: `pnpm test src/features/campaigns/campaign-model.spec.ts`

实现：

```ts
getCampaignFieldAccess(campaign: CampaignViewModel): CampaignFieldAccess
validateCapacityLimit(currentCount: number, nextLimit: number): ValidationResult
createCampaignAdapter(capabilities: CapabilityRegistry): CampaignAdapter
```

- [ ] **Step 3: 实现 A10–A12**

页面完整呈现列表、编辑、版本和容量结构；所有服务端写操作显示待接入，不使用本地数据生成成功状态。

- [ ] **Step 4: 验证并提交**

Run: `pnpm test src/features/campaigns/campaign-model.spec.ts`

```bash
git add src/features/campaigns src/pages/campaigns src/router
git commit -m "feat: 完成限时活动管理页面与规则约束"
```

### Task 5: A13 消息中心与阶段回归

**Files:**

- Create: `src/features/work-items/work-item-adapter.ts`
- Create: `src/features/work-items/use-work-items.ts`
- Create: `src/features/work-items/use-work-items.spec.ts`
- Create: `src/pages/work-items/work-item-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Produces: `createWorkItemAdapter(client)`、`useWorkItems(adapter)`。
- Consumes: 阶段一 `WorkItemViewModel`。

- [ ] **Step 1: 写失败测试**

```ts
test('保持服务端 priority_rank due_at key 顺序并将信息提醒单独分组', async () => {
  await controller.load()
  expect(controller.actionable.value.map((item) => item.priorityRank)).toEqual([
    10, 20, 30, 40, 50, 60
  ])
  expect(controller.informational.value[0]?.priorityRank).toBe(100)
})
```

- [ ] **Step 2: 运行失败测试并实现 adapter、composable 和 A13**

Run: `pnpm test src/features/work-items/use-work-items.spec.ts`

实现：

```ts
createWorkItemAdapter(client: ApiClient): WorkItemAdapter
useWorkItems(adapter: WorkItemAdapter): WorkItemController
```

- [ ] **Step 3: 运行阶段验证**

Run: `pnpm check && pnpm test && pnpm build`

Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add src/features/work-items src/pages/work-items src/router
git commit -m "feat: 完成消息中心与待办优先级展示"
```
