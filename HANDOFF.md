# 最新内容列表与用户分页测试发布（2026-11-04）

按用户授权，场景卡片／听读文章列表 Element Plus 还原及用户单页分页修复已推送 `test`，测试后台固定源码 `d2d07f0` 已发布。`pnpm check`、280 项单元测试和 6 项浏览器测试通过；线上三个列表显示正常，用户空列表分页已实际验证，控制台无错误。70 个安装文件及公网入口哈希匹配，19 个既有容器不变，无远程数据库迁移、API／小程序或生产发布。见[发布与验收记录](docs/verification/content-lists-element-plus-test-release-20261104.md)。已打开的测试后台标签页刷新一次获取新资源。

---

# 最新听读显示与场景编辑测试发布（2026-11-02）

听读正文重复提示已移除，重点词汇改为四色背景并加粗；后台旧页面资源失效时提供受离页保护的刷新恢复入口。测试后台页面已重新发布并实际点击编辑、返回批次核验；小程序 `1.5.0-r17.06.1102.4` 已上传，体验版由用户手动切换。旧后台标签页先刷新一次。本次无API部署、数据库迁移或生产发布。固定源码与检查见[发布记录](docs/verification/listening-edit-fixes-test-release-20261102.md)。

---

# 最新同步测试发布（2026-11-02）

用户授权所有应用服务同步发布测试环境后，管理后台固定源码`336d5b2`已重新打包并发布，公网入口及安装文件哈希与发布包一致；后台check、57文件238测试通过。双角色API及独立听读Worker等7服务同步更新至正文发音优化版本，无数据库迁移或生产发布。见[完整发布记录](https://github.com/zhanjiangmrlu/juya-api/blob/test/docs/verification/word-audio-test-release-20261102.md)。

---

# 最新听读修复测试发布（2026-11-02）

听读高亮、吸顶背景、大图缩放和后台词汇表单修复已推送两个仓库远程 `test`。后台测试站点已部署；小程序 `1.5.0-r17.06.1102` 已上传，体验版由用户手动切换。本次无 API 部署、数据库迁移或生产发布。固定源码与实际验证见[发布记录](docs/verification/listening-ui-test-release-20261102.md)。本地热更新保留；下方为更早阶段记录。

---

# 最新测试发布（2026-11-01）

用户新增授权后，整合06代码已推送远程 test，后台及双角色 API／Worker 已部署测试环境，测试库升级0024／contract3。微信包 1.5.0-r17.06.1101 上传成功，体验版由用户手动切换。固定提交、备份及实际核验见[发布记录](https://github.com/zhanjiangmrlu/juya-api/blob/test/docs/verification/integration06-test-release-20261101.md)。下方“未部署”等表述是此前本地交付时的历史状态；本次未部署生产环境。原目录及本地热更新环境保留。

---

# 整合06／修订17本地接续（2026-11-01）

本轮后台已切换直接分类、可选重点词汇与逐项免费契约，工作树为 `codex/revision17-integration06`。当前实现、验证命令及本地浏览器接续见 [整合06后台交接](docs/handoff/revision17/integration06/README.md)。下方整合05及更早记录仅用于历史追溯；旧主题、免费数量与全局免费排序不再是当前入口。未推送或部署。

---

# 整合05／修订17本地接续（2026-10-30）

本轮在隔离工作树`codex/revision17-integration05`实现，原运行目录未覆盖，未推送或部署。需求更新至整合05/T01—T300，最低schema仍0023。当前结果、配套版本、55画板与103关联状态、300条追踪及截图，见同级[API交接](../juya-api/docs/handoff/revision17/integration05/README.md)。下方2026-10-29为冻结历史，不作为本轮验收结论。

本地后台：`VITE_API_BASE_URL='' VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:5181 pnpm dev --port 5183 --strictPort`。使用原本地账号环境时请按已有实际端口替换；不要将自动化验证库当业务库。新增目录删除/原子排序、直接M保存、导入双出口/直接发布、英文主题优先，未知结果通过固定请求回执恢复。

检查：`pnpm check`、`pnpm test`、`pnpm build`。新增`tests/e2e/integration05-live.spec.ts`需显式本地合成fixture及私有storageState，通过`JUYA_INTEGRATION05_FIXTURE`/`JUYA_INTEGRATION05_STATE`传入；严禁提交Token或私有fixture。

---

## 2026-10-29冻结记录

# 修订17 MacBook接续入口

本轮用户授权提交、推送远程`test`用于换MacBook继续开发，未授权部署。后台与同级`juya-api`、`juya-miniapp`配套，CLI本轮未修改。

MacBook此前已运行四个项目，按同级API仓库的[完整MacBook交接](../juya-api/HANDOFF.md)增量更新；GitHub上可读[远程交接](https://github.com/zhanjiangmrlu/juya-api/blob/test/HANDOFF.md)。本次需求文档由用户同步；53个Figma链接、三端实施/复审报告、276条追踪及9张截图随API仓库提交。

本机要求Node22.22以上且小于23、pnpm11.25.0。在当前仓库：

```zsh
pnpm install --frozen-lockfile
VITE_API_BASE_URL='' VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8001 pnpm dev
```

后台默认`http://127.0.0.1:5173`；保留Mac原本地MySQL/Redis、配置及管理员，先备份原本地库再增量迁移0022，重启8001/8002和独立听读worker。实际端口沿用Mac已有配置，不连接远程测试数据库。

当前听读包含分类、主题、两种独立排序、免费M确认、文章草稿/发布版、导入/恢复/软删、时间轴状态及用户双类统计。批次更新需明确选择已有目标、核对前后差异，确认后只更新原草稿；原发布版及学习历史不变。未知结果保留原幂等键，先查实际回执。

检查用`pnpm check`、`pnpm test`、`pnpm build`。提交前本轮新鲜完整188项通过；真实浏览器及更早各阶段记录见API仓库交接，不累加重叠测试计数。完整53画板/真机/ASR仍未验，源码与构建完成不代表业务全验收。

`.env`、浏览器storageState、账号、上传fixture、`node_modules`、`dist`和`test-results`均不随Git迁移。若要继续E2E，按`tests/e2e/revision17-*-live.spec.ts`需要的环境变量重新配置本地合成资料，不能复用Windows登录Token。
