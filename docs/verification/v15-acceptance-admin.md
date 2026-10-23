# V1.5 后台验收修复

日期：2026-10-24（北京时间）；工作区：`/Users/lubi/Desktop/juya/.worktrees/juya-admin-figma-rev14`；基线：`ef93787`

## 范围与实现

仅修改后台仓库，执行已批准的 `/Users/lubi/Desktop/juya/验收问题/v1.5修复执行计划.md` 中问题 1 和问题 3 后台侧。已阅读验收原文、问题 1/3 截图及本仓库 `AGENTS.md`。

### 问题 1：删除未完成导入批次

- `src/features/imports/import-resume-panel.vue`：单候选和多候选列表每行均有“删除批次”，继续处理入口保留。这里是删除一个明确选择的整个批次，没有跨批次批量删除接口。
- `src/features/imports/import-batch-deletion-dialog.vue`：确认显示来源名称和影响；确认前不发送删除请求，取消不更改服务端。明确说明已保存的卡片、素材和用户成绩保留。
- 一次确认冻结原始 `updated_at` 字符串和 `Idempotency-Key`，不格式化、不将后台刷新的版本偷偷带入重试。
- 响应未知时禁止关闭／取消和正常路由离开，浏览器关闭提示尚有待确认操作；点击“查询／重试删除”先查询既有操作结果，仅操作查询明确 404 时以原正文、原键重新 DELETE。查询失败不盲目重发。只接受匹配批次且 `deleted === true` 的回执。
- 403/404/409 显示服务端错误并提供“刷新待处理批次”，旧确认不能直接重发，必须重新选择并确认新快照。覆盖批次资料变化及在途保存保护的 409。
- `src/pages/imports/import-workflow-page.vue`：删除确认只针对候选列表，当前批次存在时隐藏候选面板；删除结果只移除对应候选。保留删除标识，后台迟到列表不能让它重新出现。候选加载不写入当前批次或暂存编辑，删除确认期间阻止创建／恢复另一批次。
- 删除只调用批次 DELETE 和既有操作查询，没有调用卡片、素材或用户成绩删除接口。正式数据的服务端保留与软删除仍由 API 实现和跨端验收验证。

### 问题 3：真实发布结果与列表刷新

- 原有发布弹窗已经从 `BatchView.items[].state` 计算成功／处理中／失败；继续保留该规则。请求已接受、HTTP 成功、queued/running/retry 均不能直接算发布成功。
- `src/features/scenes/scene-batch-publication.vue` 统一接收服务端结果；首次观察某个持久成功项时通知列表刷新，相同成功项重复查询不重复触发；查询恢复后清除旧查询错误。
- `src/pages/scenes/scene-list-page.vue` 在弹窗仍开着时刷新原筛选列表；提前关闭结果后，最近发布记录继续有限查询，观察到新成功结果也刷新列表。
- 发布记录增加查询代次校验；离开／返回及重复查询时旧响应不能覆盖新结果，离开或销毁停止本地定时查询。
- 结果说明已学过滤规则：重新发布后未学卡回待学；已学卡保留成绩，从学习记录或收藏复习。没有向服务端增加任何重置成绩或改变已学状态的请求。
- 重点回归 `status=offline`、`has_unpublished_changes=false`、保留 `current_version_id` 的卡片：仍获取绑定修订的预览、要求管理员确认、提交批次、等待 Worker，不能归入“无需发布”。覆盖失败、重试、成功，以及弹窗关闭前／后两条刷新路径。

## 接口契约

- 删除：`DELETE /api/admin/v1/imports/{batch_id}`，JSON `{ "expected_updated_at": "<原始 updated_at>" }`，成功 `{ "id": "<batch_id>", "deleted": true }`。
- CSRF、管理员 Cookie 和 `Idempotency-Key` 沿用 `src/services/http-client.ts`。删除确认显式传入稳定 key，不为每次重试生成新键。
- 未知回执：`GET /api/admin/v1/operations/{key}`，读取 `OperationResponse.result`。
- 发布：沿用 `/api/admin/v1/cards/{id}/preview`、`POST /api/admin/v1/publication-batches` 及批次读取／重试；真实结果为 `BatchView.items[].state`，成功仅 `succeeded`，失败仅 `failed`，其他状态展示处理中。
- 已核对 API 对话的锁定说明：`/Users/lubi/Desktop/juya/github-repos/juya-api/docs/implementation/v15-acceptance-api-contract.md`。冲突测试使用真实 `import_changed`／`import_saving` 错误码与消息。
- 权威 OpenAPI 来源：API 仓库 `openapi/admin.json`；本仓库契约位置：`openapi/admin.json`、`src/shared/contracts/generated/admin-api.d.ts`。`DELETE` 导出后已从权威文件复制并运行 `pnpm generate:api`，删除请求／回执改用生成的 `DeleteImport`／`DeletedImport`，既有发布与操作查询也使用生成类型。复制后仅按本仓库 Prettier 格式排版，解析后的 JSON 与权威文件严格相等；权威源文件 SHA-256 为 `158d085733e356a704ac42706ddba9f02dcd6204b4e7707458ab0ceb4beb8100`。

## 验证证据

工具 PATH：`/Users/lubi/Desktop/juya/.tools/node/bin:$PATH`。以下命令均在本工作区运行，无云端业务写入。

1. 红灯：先新增页面删除／发布成功通知回归，再运行 `pnpm test src/pages/imports/import-workflow-recovery.spec.ts src/features/scenes/scene-batch-publication.spec.ts`，5 项按预期失败（缺少删除入口和成功通知），15 项通过；实现后 20 项全过。
2. 红灯：新增返回页面后迟到发布历史回归，`pnpm test src/pages/scenes/scene-list-page.spec.ts` 复现成功 1 被旧 queued 改成成功 0；增加代次校验后 10 项全过。
3. 查询恢复回归先复现成功结果仍残留旧连接错误，统一接收结果时清除旧错误后转绿。删除确认组件另覆盖：精确版本／幂等键冻结、丢失回执查询成功不再 DELETE、操作查询 404 原请求重试、查询 503 不重发、错误回执不移除候选、防重复提交。
4. `pnpm test`：38 文件、164 项全过（含新增的迟到历史、查询错误恢复和删除状态隔离回归）。jsdom 的已有媒体 `pause()` 提示不影响测试结果。
5. `pnpm check`：格式、ESLint、Stylelint、Vue/TypeScript 检查通过。检查过程中修正了临时局部回执的 TypeScript 收窄问题；同步权威 OpenAPI 后按本仓库规则格式化 JSON，再重新执行全量检查。
6. `pnpm build`：通过（Vite production build）。
7. `JUYA_E2E_CHANNEL=chrome pnpm exec playwright test tests/e2e/v15-acceptance-admin.spec.ts`：4 项通过。使用真实 Vue Router、真实 Element Plus 弹窗和 HTTP client，网络边界为完整契约形状的合成 API，不伪装成后端联调。断网回执测试验证真实 CSRF/Idempotency-Key 请求头，Escape 不能关闭未知状态。
8. `JUYA_E2E_CHANNEL=chrome pnpm exec playwright test tests/e2e/v15-acceptance-admin.spec.ts tests/e2e/import-recovery.spec.ts tests/e2e/import-removal-recovery.spec.ts`：11 项通过，覆盖既有 0/1/7 候选、恢复错误、保存结果目的地和多 ZIP 单个／批量移除回归。
9. 默认 Playwright Chromium headless 缓存未安装，首次启动失败；改用已安装 Chrome 后运行通过，无需下载依赖。
10. `git diff --check`：通过。

浏览器截图已经人工查看，确认弹窗、状态、按钮和列表展示可见且无遮挡：

- [单批次未知回执](v15-delete-single-unknown.png)
- [多批次未知回执](v15-delete-multiple-unknown.png)
- [Worker 成功发布结果](v15-republish-success.png)

## 审查结论与外部边界

- 本轮代码自查发现并修复迟到发布记录覆盖新状态的竞态，已由失败回归验证。独立跨仓库代码审查及最终 HTTP 联调由主协调对话执行。
- 云端只读证据表明目标卡在截图操作后仍为 offline，最近匹配成功记录早于截图；该用户无完成记录，不能用已学过滤解释此具体云端现象。本轮合成网络测试证明后台能正确走 offline 且无候选变化的重新发布链路，**不能据此声称云端问题 3 已解决或全部根因已定位**。
- 主协调补充的首轮隔离 HTTP + SQLite + Chrome 证据：删除／取消／刷新保留 13 张已存卡；offline 且候选无变化的批量重新发布完成后，后台行自动刷新。这是主协调执行的联调补充，不替代本对话自己的 164 项单测、11 项合成网络浏览器回归和完整检查。最终跨端验收与云端问题 3 的后续定位仍由主协调负责。
- 未推送、部署、上传小程序，未修改远端，未删除真实业务数据；未修改另外两个实现仓库。
- 删除未知回执在当前页面内查询恢复；浏览器强制刷新／关闭会丢失当前确认的本地操作键，服务端幂等与软删除仍保护正式卡片。页面已给出正常离开保护；本次没有新增跨浏览器会话的操作持久化存储。
