# A17–A24 内容生产 Figma 还原交接

日期：2026-10-08。开发对话 3；状态：READY_FOR_INTEGRATION（归属实现与验证完成，统一视觉验收由集成负责）。

按 `docs/superpowers/plans/2026-10-08-admin-figma-restoration.md` 和 `docs/figma-20261008-manifest.json` 实施，直接使用当前 main。未新建分支、worktree、对话或子代理；未暂存、提交、推送。没有修改公共布局、主题、路由、导航、API、控制器或 feature TS。集成负责统一中文提交。

## 设计读取与页面映射

已读取 figma-design-to-code 技能，逐节点调用含截图的 get_design_context，全部 12 个节点取得设计文本及截图。设计文件：[句芽英语管理后台](https://www.figma.com/design/evoGqXQ4pI3Q3cdLpc6NOc?node-id=2538-1022)。图中原图属于业务素材，继续使用已有动态素材签发流程，没有写入 Figma 图片 URL、硬编码示例素材或把设计截图作为页面。

| 页面 / 状态        | 节点      | 现有路由 / 阶段                            | 归属改动                                                                                                                                                                            |
| ------------------ | --------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A17 内容列表       | 2538:1022 | `/content/scenes`                          | content-list-page.vue：浅绿查询与入口区域、圆角表格、真实状态/分页、操作说明；保留关键词/系列/状态查询、新建、草稿/历史/检查发布及下线入口。                                        |
| A18 场景草稿       | 2538:1100 | `/content/scenes/:id/edit?stage=draft`     | scene-editor-page.vue、scene-draft-panel.vue：690:452 双栏，左侧统一表单、右侧素材规则与生产入口，绿色表单、20px 标题、表单分组和动态原图比例。                                     |
| A18S 调用前确认    | 2538:1166 | `/content/scenes/:id/edit?stage=ocr`       | scene-ocr-panel.vue：绿色原图区域和白色候选区域，明确计次说明、额度信息、显式启动按钮、无候选时的人工录入指引。                                                                     |
| A18T 额度不足      | 2538:1229 | 同上，额度为零 / 关闭                      | 依据原有 quota 显示红色不可用说明，保留草稿与人工录入路径；实际启动拦截仍由原控制器执行。                                                                                           |
| A19 OCR 候选       | 2538:1289 | 同上，任务成功且 candidateReady            | 原始位置/可信度/分组建议放在原图卡，右侧可编辑候选、选中字段与当前草稿对照；保留显式确认分组、分配、采纳和 busy/disabled 守卫。                                                     |
| A19S 采纳后        | 2538:1352 | 同上，已采纳当前候选                       | 根据原有候选状态显示当前草稿字段对照和采纳说明，标题/对话/词汇/语块全部取实际 form。                                                                                                |
| A20 内容校对       | 2538:1415 | `/content/scenes/:id/edit?stage=proofread` | scene-proofread-panel.vue、dialogue-fields.vue、lexicon-fields.vue：卡片标题、圆角字段组与说明样式；保留基础表单、完整双语对话、词汇/语块库、稳定编号、来源句、发音候选、人工确认。 |
| A21 音频标时       | 2538:1481 | `/content/scenes/:id/edit?stage=audio`     | scene-audio-panel.vue：全宽绿色音频卡、紧凑双栏操作与版本选择、下方白色逐句标时卡；说话人/双语句子并排，时间字段与采集/试听/确认同组。                                              |
| A22 预览发布       | 2538:1550 | `/content/scenes/:revisionId/publish`      | publish-check-page.vue：左侧绿色设备预览、右侧白色发布检查、检查类别标记、独立底部返回音频/确认发布按钮；设备内容内部滚动。                                                         |
| A22S 检查通过      | 2538:1612 | 同上，服务端检查无 error/warning           | 服务端返回后才展示通过提示并使用原 canPublish 放开发布；具体 error 和 warning 确认流程完整保留。                                                                                    |
| A23 开放及预览配置 | 2538:1674 | `/content/discovery-config`                | discovery-config-page.vue：690:452 双栏，左侧绿色开放场景与替换规则，右侧系列预览和学习模块；保留实际编号输入、乐观锁冲突、完整保存、模块只读规则。                                 |
| A24 批量与回收站   | 2538:1737 | `/content/jobs`                            | batch-jobs-page.vue：全宽绿色批量任务、白色回收站，任务标题间距与行样式，创建/草稿回收表单仍保留在后续区域；保留展开详情、分页、取消、失败重试、下载结果、恢复和保留期清理守卫。    |

另外保留并统一样式的三条现有入口：`/content/import`（content-import-page.vue）、`/content/ocr/:jobId/:assetId`（ocr-review-page.vue）、`/content/scenes/:id/audio`（audio-version-page.vue）。

## 文件范围与业务核对

归属共 14 个 Vue：8 个 src/pages/content 页面、4 个 scene-* 生产面板、dialogue-fields.vue 和 lexicon-fields.vue。对比 HEAD 中所有归属 Vue 的 script 段，14 个均保持不变。模板调整保持原有 v-model、事件、API 参数和禁用条件；候选字段组件从右卡移至左卡后仍在 disabled fieldset 内。

仅调整 `tests/e2e/content-production.spec.ts` 一处标题定位：从旧标题“对话与句子标时”更新为设计标题“逐句起止时间”。没有改公共 fixtures/config；没有增加仅镜像样式的单元测试。

## 最终检查结果

| 命令                                                                                                                                                                                                                                            | 结果                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm test src/pages/content src/features/content-production src/features/content-editor src/features/ocr src/features/audio --maxWorkers=2`                                                                                                    | 22 文件、73 项通过；最终复跑 12:04:20，18.32 秒。                                    |
| `pnpm exec eslint "src/pages/content/*.vue" "src/features/content-production/scene-*.vue" src/features/content-editor/dialogue-fields.vue src/features/content-editor/lexicon-fields.vue tests/e2e/content-production.spec.ts --max-warnings=0` | 通过。                                                                               |
| `pnpm exec stylelint "src/pages/content/*.vue" "src/features/content-production/scene-*.vue" src/features/content-editor/dialogue-fields.vue src/features/content-editor/lexicon-fields.vue`                                                    | 通过。Element Plus BEM 覆盖使用页面级 selector-class-pattern 说明，其余规则有效。    |
| `pnpm exec vue-tsc --noEmit -p tsconfig.app.json`                                                                                                                                                                                               | 通过。                                                                               |
| `pnpm exec prettier --check "src/pages/content/*.vue" "src/features/content-production/scene-*.vue" src/features/content-editor/dialogue-fields.vue src/features/content-editor/lexicon-fields.vue tests/e2e/content-production.spec.ts`        | 通过。                                                                               |
| `pnpm exec playwright test --config .impeccable/review/content-20261008/playwright.config.ts`                                                                                                                                                   | 最终 31 项全部通过，2.1 分钟；29 项既有流程测试 + 2 项临时视觉检查。独立端口 19273。 |
| `git diff --check -- src/pages/content src/features/content-production src/features/content-editor/dialogue-fields.vue src/features/content-editor/lexicon-fields.vue tests/e2e/content-production.spec.ts`                                     | 通过；14 个 Vue script 段对比无变化。                                                |

浏览器覆盖五组现有测试：content-production、content-editing、content、c02-content、media-jobs。覆盖同一草稿跨阶段保存、409 保留输入、保存期间锁定、结构化双语及稳定编号、OCR 显式调用与额度/幂等/人工分组/选中采纳、历史候选、词条发音人工确认、整段音频装载及播放/暂停/时间采集、逐句核对、发布缺项和 warning 确认、发现配置冲突、批量上传/失败重试和双视口可操作性。

全部使用现有模拟 API 夹具；没有调用真实 OCR/TTS，没有真实发布或绑定未经人工确认的真实音频。截图测试核对归属页面实际路由加载、无 skeleton、无未定义夹具请求、1440×900 与 1280×800 页面横向溢出不超过 1px。

早期浏览器失败分别来自标题定位未同步，以及临时截图脚本等待了错误的夹具标题；已修正并完整复跑 31 项通过。曾观察到 Vite ResizeObserver 开发覆盖提示，最终功能用例通过，但未对整个后台作控制台清洁验收。

## 截图与复跑证据

证据绝对目录：`D:/个人/juya/juya-admin/.impeccable/review/content-20261008/`，git 忽略，仅本地保留。最终综合复跑已重新生成以下截图。

| 页面     | 1440×900                    | 1280×800                    |
| -------- | --------------------------- | --------------------------- |
| A17      | A17-1440x900.png            | A17-1280x800.png            |
| A18      | A18-1440x900.png            | A18-1280x800.png            |
| A18S     | A18S-1440x900.png           | A18S-1280x800.png           |
| A20      | A20-1440x900.png            | A20-1280x800.png            |
| A21      | A21-1440x900.png            | A21-1280x800.png            |
| A22      | A22-1440x900.png            | A22-1280x800.png            |
| A23      | A23-1440x900.png            | A23-1280x800.png            |
| A24      | A24-1440x900.png            | A24-1280x800.png            |
| 批量上传 | IMPORT-1440x900.png         | IMPORT-1280x800.png         |
| OCR 详情 | OCR-DETAIL-1440x900.png     | OCR-DETAIL-1280x800.png     |
| 音频版本 | AUDIO-VERSIONS-1440x900.png | AUDIO-VERSIONS-1280x800.png |

四个补充状态：`A19-1440x900.png`、`A19S-1440x900.png`、`A18T-1440x900.png`、`A22S-1440x900.png`。通过点击刷新、确认分组、采纳字段、模拟额度零、运行发布检查生成，未执行真实发布。共 26 张截图。

临时复跑入口 `playwright.config.ts`、`capture.config.ts`、`capture.spec.ts`，输出 `results/`、`capture-results/` 均在证据目录。综合配置包含 29 项既有流程及 2 项截图；仅截图配置使用独立端口 19274。

## 集成与剩余验收边界

- 保留六阶段导航和有意义的阶段操作行，因此 A18–A22 主卡纵向起点比 Figma 的静态画板更低。实际编辑器比示例画板包含更多必要输入和动作，保持自然纵向滚动。A20 仍保留基础表单和完整结构化编辑区，没有把可编辑内容替换为只读设计样例。
- A17 现有列表契约没有原图版本、音频版本、开放位置等设计字段，显示真实场景/系列/状态/更新时间/操作；没有填入设计样例数字。A23 当前配置契约以编号输入为主，保留真实配置表单，没有新增无数据源的封面选择器。
- 测试夹具没有场景原图，截图原图区显示原有缺图提示。业务真实图片沿用已有签发地址及 object-fit: contain。模拟音频 URL 不提供全部有效媒体字节，截图不能证明实际听音；c02 的有效 WAV 用例验证了播放、暂停及时间采集，但仍不等于耳机听音验收。
- 公共壳/主题处于并行改动中，截图中部分 ElTag 状态标签颜色偏淡，归属页未覆盖公共组件；请集成在公共样式最终稳定后核对状态可读性、全部路由入口、设备预览、长表单和 30 个画板。
- 归属工作没有待修的功能测试失败或外部阻塞。仓库级 pnpm check、全量测试、build、整体视觉验收、统一提交由集成执行。真实服务、内容确认、生产和真机验收均未完成，不能以此次模拟测试替代。
