# juya-admin 阶段三问题反馈闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 A14–A16，真实接入反馈详情与处理命令，并准确表达列表、时间线和截图接口的待接入边界。

**Architecture:** 反馈状态矩阵独立于页面，所有命令复用统一幂等控制器。详情接口提供的字段真实展示，缺失的列表、时间线和截图签名能力通过 capability registry 控制。

**Tech Stack:** Vue 3.5、TypeScript、Element Plus、dayjs、Vitest、Vue Test Utils。

**Spec:** `docs/superpowers/specs/2026-09-28-juya-admin-v1-design.md`

## Global Constraints

- 遵守 roadmap 中全部 Global Constraints。
- 反馈正文只按文本渲染，禁止 `v-html`。
- 要求补充最多两轮；管理员回复模板必选，补充说明最多 200 字。
- 内部备注与用户回复使用不同字段和组件。
- 所有函数注释必须包含用途、每个 `@param` 和 `@returns`。

## Review Focus

- 第三轮补充操作不渲染，直接调用控制器也必须拒绝。
- 等待补充时 SLA 停止倒计时，用户补充后按新 deadline 展示。
- 反馈正文中包含 HTML 时必须原样作为文本显示。
- 409 状态冲突不能重复发送回复。
- 截图接口待接入时不显示失效或虚构 URL。

---

### Task 1: 反馈状态矩阵、SLA 与时间线组件

**Files:**

- Create: `src/features/feedback/feedback-model.ts`
- Create: `src/features/feedback/feedback-model.spec.ts`
- Create: `src/components/audit-timeline/audit-timeline.vue`
- Create: `src/components/audit-timeline/audit-timeline.spec.ts`
- Create: `src/features/feedback/feedback-copy.ts`

**Interfaces:**

- Produces: `getFeedbackOperations(ticket)`、`formatFeedbackSla(ticket, now)`、`FeedbackTimelineItem`。
- Consumes: OpenAPI `FeedbackTicket`。

- [ ] **Step 1: 写失败测试**

```ts
test('两轮补充后不再允许要求补充', () => {
  expect(getFeedbackOperations({ status: 'PROCESSING', supplementRounds: 2 })).not.toContain(
    'REQUEST_SUPPLEMENT'
  )
})

test('等待补充时展示暂停的剩余时长而不是继续倒计时', () => {
  expect(formatFeedbackSla(waitingTicket, now)).toEqual({ state: 'paused', text: '等待用户补充' })
})
```

另测超时、12 小时内和正常状态。

- [ ] **Step 2: 验证失败并实现**

Run: `pnpm test src/features/feedback/feedback-model.spec.ts src/components/audit-timeline/audit-timeline.spec.ts`

实现：

```ts
getFeedbackOperations(ticket: FeedbackViewModel): readonly FeedbackOperation[]
formatFeedbackSla(ticket: FeedbackViewModel, now: Date): FeedbackSlaViewModel
```

- [ ] **Step 3: 运行测试并提交**

Run: `pnpm test src/features/feedback/feedback-model.spec.ts src/components/audit-timeline/audit-timeline.spec.ts`

```bash
git add src/components/audit-timeline src/features/feedback
git commit -m "feat: 建立反馈状态与处理时限模型"
```

### Task 2: 反馈 adapter 与命令控制器

**Files:**

- Create: `src/features/feedback/feedback-adapter.ts`
- Create: `src/features/feedback/use-feedback-detail.ts`
- Create: `src/features/feedback/use-feedback-detail.spec.ts`
- Create: `src/features/feedback/use-feedback-command.ts`
- Create: `src/features/feedback/use-feedback-command.spec.ts`

**Interfaces:**

- Produces: `createFeedbackAdapter(client)`、`useFeedbackDetail(adapter, ticketId)`、`useFeedbackCommand(adapter, ticket)`。
- Consumes: `ApiClient`、`useIdempotentCommand`、反馈状态矩阵。

- [ ] **Step 1: 写详情和命令失败测试**

```ts
test('解决命令必须有模板且说明不超过 200 字', async () => {
  await expect(controller.resolve({ note: '说明', template: '' })).rejects.toMatchObject({
    code: 'CLIENT_VALIDATION_ERROR'
  })
  await expect(
    controller.resolve({ note: 'a'.repeat(201), template: 'RESOLVED' })
  ).rejects.toMatchObject({ code: 'CLIENT_VALIDATION_ERROR' })
})
```

另测第三轮补充零请求、409 保留输入、成功后重新读取详情。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test src/features/feedback/use-feedback-detail.spec.ts src/features/feedback/use-feedback-command.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 adapter 与 composable**

实现：

```ts
createFeedbackAdapter(client: ApiClient): FeedbackAdapter
useFeedbackDetail(adapter: FeedbackAdapter, ticketId: MaybeRef<string>): FeedbackDetailController
useFeedbackCommand(adapter: FeedbackAdapter, ticket: Ref<FeedbackViewModel | null>): FeedbackCommandController
```

- [ ] **Step 4: 验证并提交**

Run: `pnpm test src/features/feedback/use-feedback-detail.spec.ts src/features/feedback/use-feedback-command.spec.ts`

```bash
git add src/features/feedback
git commit -m "feat: 完成反馈详情与处理命令接入"
```

### Task 3: A14–A16 页面与阶段回归

**Files:**

- Create: `src/pages/feedback/feedback-list-page.vue`
- Create: `src/pages/feedback/feedback-detail-page.vue`
- Create: `src/pages/feedback/feedback-respond-page.vue`
- Create: `src/pages/feedback/feedback-pages.spec.ts`
- Create: `src/components/plain-text-content/plain-text-content.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Consumes: feedback adapter、composable、状态矩阵、时间线组件。
- Produces: A14–A16 路由页。

- [ ] **Step 1: 写页面失败测试**

```ts
test('把反馈正文中的 HTML 标记作为纯文本显示', () => {
  const wrapper = mountPage({ description: '<img src=x onerror=alert(1)>' })
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
})

test('列表接口缺失时显示待接入且不发请求', async () => {
  expect(wrapper.text()).toContain('反馈列表接口待接入')
  expect(fetchSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 验证失败并实现页面**

Run: `pnpm test src/pages/feedback/feedback-pages.spec.ts`

A14 完整还原列表结构但标记待接入；A15 接入详情并对时间线和截图分区显示能力状态；A16 接入开始、补充、解决和关闭命令。

- [ ] **Step 3: 运行阶段验证**

Run: `pnpm check && pnpm test && pnpm build`

Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add src/components/plain-text-content src/pages/feedback src/router
git commit -m "feat: 完成问题反馈列表详情与回复页面"
```
