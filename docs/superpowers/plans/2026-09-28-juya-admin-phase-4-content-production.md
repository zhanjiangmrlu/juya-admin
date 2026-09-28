# juya-admin 阶段四内容生产与发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 A17–A24 内容生产链路，真实接入上传、版本、发布、下线和场景配置接口，并明确 OCR、编辑保存、音频和批量任务的待接入边界。

**Architecture:** 内容生产按上传、校对、编辑、音频、发布和配置拆分 feature。上传通过 `XMLHttpRequest` 支持进度与取消；所有草稿、候选和发布操作都保持稳定 ID、revision 和幂等边界。

**Tech Stack:** Vue 3.5、TypeScript、Element Plus、Web Crypto、XMLHttpRequest、Vitest、Vue Test Utils。

**Spec:** `docs/superpowers/specs/2026-09-28-juya-admin-v1-design.md`

## Global Constraints

- 遵守 roadmap 中全部 Global Constraints。
- 图片单批最多 30 张，必须同系列、同模板；音频单批最多 300 个；批量内容任务最多 500 项。
- 上传先计算 SHA-256，再使用临时凭证直传私有 OSS，最后调用确认接口。
- OCR 候选不得覆盖人工版本；草稿允许不完整，发布检查必须完整。
- 所有函数注释必须包含用途、每个 `@param` 和 `@returns`。

## Review Focus

- 取消上传后不得调用上传确认接口。
- 一个文件失败不得取消其他文件，重试不得重新上传已确认对象。
- 远端 revision 变化时自动保存必须停止，不能覆盖新版本。
- 发布检查包含 error 时禁止发布，warning 未确认时也禁止发布。
- 当前开放场景下线失败时必须保留页面状态并引导先替换配置。

---

### Task 1: A17 内容列表和版本能力边界

**Files:**

- Create: `src/features/content/content-model.ts`
- Create: `src/features/content/content-model.spec.ts`
- Create: `src/features/content/content-adapter.ts`
- Create: `src/pages/content/content-list-page.vue`
- Create: `src/pages/content/content-list-page.spec.ts`
- Modify: `src/router/index.ts`

**Interfaces:**

- Produces: `createContentAdapter(client)`、`getSceneOperations(scene)`。
- Consumes: OpenAPI 内容版本、发布和下线接口；capability registry。

- [ ] **Step 1: 写失败测试**

```ts
test('已发布内容只允许创建新草稿或下线且不提供永久删除', () => {
  expect(getSceneOperations(publishedScene)).toEqual(['CREATE_REVISION', 'OFFLINE'])
})

test('内容列表接口待接入时不发送请求', async () => {
  await controller.load()
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(controller.state.value).toBe('pending')
})
```

- [ ] **Step 2: 验证失败并实现内容模型与 adapter**

Run: `pnpm test src/features/content/content-model.spec.ts src/pages/content/content-list-page.spec.ts`

实现：

```ts
getSceneOperations(scene: SceneSummary): readonly SceneOperation[]
createContentAdapter(client: ApiClient, capabilities: CapabilityRegistry): ContentAdapter
```

- [ ] **Step 3: 实现 A17 并提交**

页面复刻搜索、系列、状态筛选和相邻的批量上传入口；列表区域显示接口待接入，不装载生产演示数据。

Run: `pnpm test src/features/content/content-model.spec.ts src/pages/content/content-list-page.spec.ts`

```bash
git add src/features/content src/pages/content src/router
git commit -m "feat: 完成内容列表与版本操作边界"
```

### Task 2: A18 上传队列、哈希、进度与取消

**Files:**

- Create: `src/features/content-import/import-validation.ts`
- Create: `src/features/content-import/import-validation.spec.ts`
- Create: `src/services/upload/hash-file.ts`
- Create: `src/services/upload/xhr-uploader.ts`
- Create: `src/services/upload/xhr-uploader.spec.ts`
- Create: `src/features/content-import/upload-adapter.ts`
- Create: `src/features/content-import/use-upload-queue.ts`
- Create: `src/features/content-import/use-upload-queue.spec.ts`
- Create: `src/components/task-progress/task-progress.vue`
- Create: `src/pages/content/content-import-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Produces: `validateImageBatch(files, context)`、`hashFile(file)`、`createXhrUploader()`、`useUploadQueue(adapter)`。
- Consumes: 上传策略和上传确认接口。

- [ ] **Step 1: 写批次校验失败测试**

```ts
test('拒绝超过 30 张或跨系列跨模板的图片批次', () => {
  expect(validateImageBatch(thirtyOneFiles, context).valid).toBe(false)
  expect(validateImageBatch(twoSeriesFiles, context).code).toBe('MIXED_SERIES')
  expect(validateImageBatch(twoTemplateFiles, context).code).toBe('MIXED_TEMPLATE')
})
```

- [ ] **Step 2: 写上传生命周期失败测试**

```ts
test('取消中的上传不会确认对象', async () => {
  controller.start(item)
  controller.cancel(item.id)
  expect(confirmUpload).not.toHaveBeenCalled()
  expect(item.status).toBe('cancelled')
})
```

另测单项失败不影响队列、已确认项重试不重传、进度 0–100。

- [ ] **Step 3: 运行测试并确认失败**

Run: `pnpm test src/features/content-import/import-validation.spec.ts src/services/upload/xhr-uploader.spec.ts src/features/content-import/use-upload-queue.spec.ts`

Expected: FAIL。

- [ ] **Step 4: 实现上传服务和队列**

实现：

```ts
validateImageBatch(files: readonly ImportFile[], context: ImportContext): ValidationResult
hashFile(file: Blob): Promise<string>
createXhrUploader(xhrFactory: XhrFactory): XhrUploader
useUploadQueue(adapter: UploadAdapter): UploadQueueController
```

- [ ] **Step 5: 实现 A18、验证并提交**

ElUpload 只接收文件；队列展示排队、处理中、成功、低置信、失败和取消。OCR 任务创建接口缺失时，确认上传后明确停留在“等待 OCR 接口接入”。

Run: `pnpm test src/features/content-import/import-validation.spec.ts src/services/upload/xhr-uploader.spec.ts src/features/content-import/use-upload-queue.spec.ts`

```bash
git add src/components/task-progress src/features/content-import src/pages/content/content-import-page.vue src/services/upload src/router
git commit -m "feat: 完成内容图片上传队列与进度控制"
```

### Task 3: A19、A20、A21 OCR、结构化编辑与音频页面

**Files:**

- Create: `src/features/ocr/ocr-model.ts`
- Create: `src/features/ocr/ocr-model.spec.ts`
- Create: `src/features/content-editor/revision-controller.ts`
- Create: `src/features/content-editor/revision-controller.spec.ts`
- Create: `src/features/audio/audio-version-model.ts`
- Create: `src/features/audio/audio-version-model.spec.ts`
- Create: `src/pages/content/ocr-review-page.vue`
- Create: `src/pages/content/scene-editor-page.vue`
- Create: `src/pages/content/audio-version-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Produces: `mergeAcceptedOcrFields()`、`createRevisionController()`、`validateAudioBatch()`、三个待接入页面。
- Consumes: capability registry。

- [ ] **Step 1: 写校对、revision 和音频失败测试**

```ts
test('接受 OCR 候选时只替换显式选中的字段', () => {
  expect(mergeAcceptedOcrFields(manual, candidate, ['title'])).toEqual({
    ...manual,
    title: candidate.title
  })
})

test('远端 revision 变化后停止自动保存', () => {
  controller.observeRemoteRevision(4)
  expect(controller.canAutosave.value).toBe(false)
  expect(controller.conflict.value).toBe(true)
})

test('音频批次超过 300 个时拒绝提交', () => {
  expect(validateAudioBatch(files301).valid).toBe(false)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test src/features/ocr/ocr-model.spec.ts src/features/content-editor/revision-controller.spec.ts src/features/audio/audio-version-model.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 实现纯业务模型**

实现：

```ts
mergeAcceptedOcrFields<T>(manual: T, candidate: Partial<T>, fields: readonly (keyof T)[]): T
createRevisionController(initialRevision: number): RevisionController
validateAudioBatch(files: readonly File[]): ValidationResult
```

- [ ] **Step 4: 实现 A19–A21**

使用设计稿结构呈现原图/候选/人工版本、分区编辑器和音频版本表。保存、重新识别、生成、确认及回退按钮显示对应接口待接入；不会写入本地假版本。

- [ ] **Step 5: 验证并提交**

Run: `pnpm test src/features/ocr/ocr-model.spec.ts src/features/content-editor/revision-controller.spec.ts src/features/audio/audio-version-model.spec.ts`

```bash
git add src/features/audio src/features/content-editor src/features/ocr src/pages/content src/router
git commit -m "feat: 完成OCR校对场景编辑与音频页面"
```

### Task 4: A22 发布检查、发布和下线

**Files:**

- Create: `src/features/publishing/publish-adapter.ts`
- Create: `src/features/publishing/use-publish-check.ts`
- Create: `src/features/publishing/use-publish-check.spec.ts`
- Create: `src/pages/content/publish-check-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Produces: `createPublishAdapter(client)`、`usePublishCheck(adapter, revisionId)`。
- Consumes: 发布检查、发布和下线接口，统一幂等控制器。

- [ ] **Step 1: 写发布闸门失败测试**

```ts
test('错误阻止发布且未确认警告也阻止发布', async () => {
  controller.applyCheck({ errorCodes: ['TITLE_REQUIRED'], warningCodes: [] })
  expect(controller.canPublish.value).toBe(false)
  controller.applyCheck({ errorCodes: [], warningCodes: ['COPYRIGHT_REVIEW'] })
  expect(controller.canPublish.value).toBe(false)
})
```

另测全部警告确认后发布、409 保留检查结果、开放场景下线错误提示。

- [ ] **Step 2: 运行失败测试并实现**

Run: `pnpm test src/features/publishing/use-publish-check.spec.ts`

实现：

```ts
createPublishAdapter(client: ApiClient): PublishAdapter
usePublishCheck(adapter: PublishAdapter, revisionId: MaybeRef<string>): PublishCheckController
```

- [ ] **Step 3: 实现 A22、验证并提交**

页面展示错误、提醒、逐项确认、管理员预览待接入状态和发布操作。

Run: `pnpm test src/features/publishing/use-publish-check.spec.ts`

```bash
git add src/features/publishing src/pages/content/publish-check-page.vue src/router
git commit -m "feat: 完成内容发布检查与发布操作"
```

### Task 5: A23、A24 开放配置和批量任务

**Files:**

- Create: `src/features/discovery/discovery-model.ts`
- Create: `src/features/discovery/discovery-model.spec.ts`
- Create: `src/features/discovery/discovery-adapter.ts`
- Create: `src/features/batch-jobs/batch-job-model.ts`
- Create: `src/features/batch-jobs/batch-job-model.spec.ts`
- Create: `src/pages/content/discovery-config-page.vue`
- Create: `src/pages/content/batch-jobs-page.vue`
- Modify: `src/router/index.ts`

**Interfaces:**

- Produces: `validateLearningModules()`、`validateOpenScenes()`、`validatePreviewScenes()`、`validateBatchJobSize()`、`createDiscoveryAdapter(client)`。
- Consumes: 开放场景和预览配置接口。

- [ ] **Step 1: 写配置与批量边界失败测试**

```ts
test('V1.3 只允许启用 scene_learning 且开放场景必须恰好三个', () => {
  expect(validateLearningModules([{ enabled: true, type: 'grammar' }]).valid).toBe(false)
  expect(validateOpenScenes(['scene-1', 'scene-2']).valid).toBe(false)
})

test('系列预览只允许 3 到 6 个且不能包含开放场景', () => {
  expect(validatePreviewScenes(previews, openScenes).code).toBe('PREVIEW_SCENE_IS_OPEN')
})
```

另测批量任务超过 500 项拒绝、被引用草稿不提供清理动作。

- [ ] **Step 2: 运行失败测试并实现模型与 adapter**

Run: `pnpm test src/features/discovery/discovery-model.spec.ts src/features/batch-jobs/batch-job-model.spec.ts`

实现：

```ts
validateLearningModules(modules: readonly LearningModuleConfig[]): ValidationResult
validateOpenScenes(sceneIds: readonly string[]): ValidationResult
validatePreviewScenes(sceneIds: readonly string[], openSceneIds: readonly string[]): ValidationResult
validateBatchJobSize(itemCount: number): ValidationResult
createDiscoveryAdapter(client: ApiClient): DiscoveryAdapter
```

- [ ] **Step 3: 实现 A23、A24**

A23 接入开放场景和系列预览写接口；配置读取和学习模块保存缺失部分显示待接入。A24 完整呈现任务和回收站结构，所有命令保持待接入。

- [ ] **Step 4: 运行阶段验证**

Run: `pnpm check && pnpm test && pnpm build`

Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/features/batch-jobs src/features/discovery src/pages/content src/router
git commit -m "feat: 完成开放场景配置与批量任务页面"
```
