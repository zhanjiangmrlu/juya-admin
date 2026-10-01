# 内容生产流程并行开发约定

日期：2026-10-01。用户已确认三个开发对话并行，当前对话负责公共导航、页面接入及最终联调。范围为补齐现有内容生产流程的六个 Tab，保留已有 API、乐观锁、OCR 幂等与额度规则、媒体上传确认和发布校验。

依据：交付目录的完整需求文档第 16 章、完整设计说明第 46 行、页面与需求对应表 A17–A22、交互原型 `app.js` 的 `productionNav`。功能与流程来自需求正文；六个 Tab 的视觉与顺序来自原型。

## 工作区与归属

- 仓库：`D:/个人/juya/juya-admin`，当前 main。三个对话共享工作区，各自仅编辑下述归属文件，不执行 reset、stash、checkout、全局格式化、全量暂存或提交。最终由集成对话统一提交中文 Conventional Commit。
- 既存 `openapi/admin-api.json`、`src/shared/contracts/generated/admin-api.d.ts` 的未提交改动不属于本次工作，不覆盖、不暂存。
- 不更改后端或 API 契约，不创建新子对话或子代理，不向其他对话发送消息。完成后在本对话返回改动文件、接口与验证结果，集成对话会读取。
- 单元验证仅运行归属模块。共享 e2e 端口与最终全量检查由集成对话串行执行。

## 公共导航：集成对话负责

`src/features/content-production/content-production-model.ts` 导出 `ProductionStage = 'list' | 'draft' | 'ocr' | 'proofread' | 'audio' | 'publish'` 和顺序一致的中文标签。编辑页以 `?stage=draft|ocr|proofread|audio` 指定工作区，默认 proofread，`ocrJob` 查询参数保留。

`src/features/content-production/content-production-nav.vue`：props `active: ProductionStage`、`busy?: boolean`；emit `select(stage: ProductionStage)`。导航只发事件，父页处理切换、上下文与保存。顺序：内容列表、场景草稿、OCR候选、内容校对、音频标时、预览发布。父页编辑草稿保持唯一状态实例，Tab 切换不重载草稿；离开编辑进入发布前保存成功才跳转。场景编号用于编辑，草稿版本编号用于发布。

集成对话独占：上述公共文件、`src/pages/content/content-list-page.vue`、`src/pages/content/scene-editor-page.vue`、`src/app/admin-navigation.ts`、既存 e2e 文件及新流程 e2e 文件。三个开发对话不得修改这些文件。

## 开发对话 1：OCR 候选

创建 `src/features/content-production/scene-ocr-panel.vue` 及同名 spec。提取现有编辑页的“显式 OCR 识别”和“候选比较与逐项采纳”展示，保留候选可编辑与原图对照，候选为空时有可操作提示。

Props：`form: SceneContent`、`candidate: SceneContent`、`quota: OcrQuota | null`、`job: OcrJob | null`、`busy: boolean`、`disabled: boolean`、`candidateReady: boolean`、`suggestions: OcrSuggestions | null`、`acceptedGroups: string[]`、`rawLines: string[]`、`imageUrl: string`。候选对象由父页持有，允许与现有组件一样更新其嵌套字段。`selectedFields` 使用 `defineModel<string[]>('selectedFields', { required: true })`。

Emits：`start()`、`refresh()`、`assign(text: string, field: string, lineId: number)`、`group(group: OcrGroup)`、`adopt()`。所有 API 调用、幂等键、采纳后更新草稿、额度逻辑留在父页。不要在组件内创建请求适配器、触发 OCR 或自动采纳。

## 开发对话 2：场景草稿与内容校对组件

创建 `src/features/content-production/scene-draft-panel.vue`、`scene-proofread-panel.vue` 及各自 spec。只提取现有基础字段和结构化校对展示，不修改现有 DialogueFields / LexiconFields。

Draft props：`form: SceneContent`、`seriesTitle: string`、`imageUrl: string`、`mediaBusy: boolean`。Emits：`upload(file: UploadFile)`、`refreshImage()`。保留中英文标题、简介、标签、原图素材及上传、封面、版权、来源、系列只读显示，沿用现有 label / aria-label。表单对象由父页持有，嵌套编辑沿用既有行为。

Proofread props：`form: SceneContent`。Emits：`busy(section: 'vocabulary' | 'chunks', value: boolean)`。包含不带 timing 的 DialogueFields、词汇及语块 LexiconFields，保留来源关联、稳定 ID、素材 busy 通知。业务保存仍由父页负责。

## 开发对话 3：音频标时与预览发布

创建 `src/features/content-production/scene-audio-panel.vue` 及同名 spec，允许修改 `src/pages/content/publish-check-page.vue` 并添加独立的发布导航测试，不改现有 e2e 或共享播放器。

Audio props：`form: SceneContent`、`versions: AudioVersion[]`、`selectedVersion: string`、`pendingFile: UploadFile | null`、`busy: boolean`、`player: ReturnType<typeof createSegmentPlayer> | null`、`canRecord: boolean`。

Emits：`load()`、`upload(file: UploadFile)`、`bind(id: string)`、`play(row?: DialogueRow)`、`record(row: DialogueRow, edge: 'start_ms' | 'end_ms')`、`refresh()`、`remove()`、`element(element: AudioElement | null)`。组件持有原生 audio ref，挂载后发出 element，卸载前发出 null，父页仍持有播放器和业务逻辑。用 `:model-value="selectedVersion" @update:model-value="emit('bind', String($event))"`。重试上传须发原 pendingFile。包含带 timing 的 DialogueFields，不改用独立音频版本管理页。

Publish 页面接入公共导航，active=publish；select list -> content-scenes；其他 stage 从 `previewController.preview.value.sceneId` 取得场景 ID 跳 content-scene-edit 并传 stage，不能把 revisionId 当 sceneId。加载失败时仍能返回列表，其他跳转应禁用或明确提示。保留原有警告确认、服务端检查、预览和发布逻辑。

## 集成验收

- 六个 Tab 出现在列表、编辑和发布工作区，当前项正确高亮，窄屏可滚动。
- 从列表选择明确场景后进入相应工作区；无草稿时显式创建草稿，不能随意带入某行数据。
- draft / OCR / proofread / audio 切换保留同一草稿、候选和媒体状态，OCR 未采纳不能覆盖正文。
- 冲突、保存中、OCR 中和素材忙时保持原保护；进入发布必须保存成功。
- 返回校对使用场景 ID，发布检查使用版本 ID；浏览器返回和查询参数恢复正确。
- 针对模块单元验证，最终运行 check、test、build 和内容生产浏览器流程。区分模拟 API 浏览器验证与真实后端验证。

## 本次集成结果

- 三个开发对话完成各自组件，集成对话接入列表、编辑及发布页面。编辑使用同一父页草稿，步骤切换不创建第二份数据；进入发布前保存，冲突时保留输入并阻止跳转。
- 只读审查发现受控音频选择器未同步父页选择值；已补浏览器失败复现并修正绑定、保存恢复及移除时的选择值同步。
- OCR 可选位置与段落为空时的展示异常已补失败单元复现并修正，人工分组和采纳仍可用。
- `pnpm check` 通过；`pnpm test --maxWorkers=4` 为 83 个文件、281 项通过；`pnpm build` 通过。
- 内容生产 5 个浏览器文件共 29 个场景：批量运行 28 项通过，剩余人工采纳测试修正重复文本定位后单独复验通过。覆盖 OCR 额度与幂等、候选不自动覆盖、素材 busy、音频标时、Tab 状态、版本发布、保存冲突和两个桌面视口。
- 浏览器回归使用模拟 API 与本地测试音频，未调用真实 OCR、未进行生产发布。当前本地 5173 页面入口 HTTP 200，8000 后端就绪；访问 `/content/scenes` 查看六个 Tab。
