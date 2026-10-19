# 修订14管理后台验收记录

更新：后续已按用户指令部署到测试环境，[测试发布与上线验收](test-deployment-20261019.md)记录实际版本；本文下述“未部署”描述初次本地交付时的范围。

本轮仅修改管理后台前端，基于 `test / 09a36c0`，工作分支 `codex/admin-figma-rev14`。需求、原型与 Figma 的优先级为：设计稿决定页面结构和视觉；需求及原型补充业务逻辑；现有真实接口决定可展示的数据和处理状态。未改小程序、后端、数据库结构，未部署。

## 实现范围

登录、卡片列表与全局排序、四区编辑表单、后台手机预览、ZIP／DOCX导入、表格内逐卡核对、素材匹配及更新差异、用户列表与学习记录、三项统计。共80个设计状态已建立 [状态映射](state-mapping.md)。页面沿用 window 滚动、KeepAlive及路由筛选恢复，未引入主内容独立滚动容器。

导入只渲染一个展开编辑器；切换保留暂存和未保存输入。预览使用真实完整音频，可播放、暂停、拖动和调整倍速，关闭时停止；Chrome已实际检查播放状态、currentTime和playbackRate。保存、发布、导入处理、上传未知回执和重试仍沿用原状态机与幂等标识。

## 已执行验证

| 检查            | 结果                     | 范围                                                                                |
| --------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `pnpm check`    | 通过                     | Prettier、ESLint、Stylelint、Vue及Node TypeScript检查                               |
| `pnpm test`     | 28文件、71用例通过       | 原有业务回归，加分段筛选、真实音频控制、单编辑器暂存、初次ZIP选择及联系方式来源标签 |
| `pnpm build`    | 通过                     | Vite生产构建；字体与SVG打包为本地资产                                               |
| `pnpm test:e2e` | 12用例通过，0跳过        | 隔离真实API、SQLite、媒体存储及后台worker，已安装Chrome                             |
| 桌面布局        | 1366／1440／1920宽度通过 | 六个登录后路由无页面横向溢出；可见图片均加载且有有效尺寸；主截图1440×1024           |
| 浏览器错误      | 断言无pageerror          | 完整发布流、全局排序、导入与七类路由巡检                                            |

浏览器回归含11项使用隔离真实服务的流程检查，以及1项浏览器故障注入检查（拦截发布并返回422，核验错误后的返回和重试入口）。真实回归包括：登录、鉴权图片音频上传、词汇来源定位、草稿持久化、发布不可变快照、旧窗口修订冲突；列表返回位置与勾选恢复；跨页选择范围、批量下线、关闭后台处理结果后自动刷新；完整集合排序；长导入预览滚动、短窗口错误footer可见性；编辑区三列词汇及紧凑对话／语块几何布局；多ZIP选择／移除／追加、跨包核对输入保留、单包多目录、坏包与坏目录部分失败，以及缺音频资料只能保存草稿。

这些是本机隔离环境验证，不能替代线上部署和真实用户账户联调。测试夹具中的用户名、学习数据和媒体均为合成／设计示例素材。未尝试真实云发音供应商调用。音频第一次播放拒绝、第二次成功后的错误提示清理另有单元回归。Vitest/jsdom沿用7条 `HTMLMediaElement.pause()` 未实现提示；真实Chrome的音频DOM与控件另有浏览器检查，未把这些提示算成业务通过证据。

## 页面与覆盖层截图

| 页面     | 证据                                                                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 登录     | [1440×1024](screenshots/design-login.png)                                                                                                                                                                                                |
| 卡片管理 | [列表](screenshots/design-cards.png)、[全局排序](screenshots/admin-global-order.png)、[图片预览](screenshots/admin-image-preview.png)                                                                                                    |
| 编辑     | [首屏](screenshots/design-editor-viewport.png)、[完整长页](screenshots/design-editor.png)、[紧凑词汇](screenshots/design-compact-vocabulary.png)、[紧凑语块](screenshots/design-compact-chunks.png)                                      |
| 预览     | [只读发布版](screenshots/design-preview.png)、[发布前候选](screenshots/publication-preview.png)、[发布错误恢复](screenshots/design-publish-error.png)、[导入长预览](screenshots/design-import-preview.png)                               |
| 导入     | [上传及继续入口](screenshots/design-imports.png)、[核对表格](screenshots/multi-zip-review.png)、[展开编辑](screenshots/multi-zip-expanded.png)、[结果](screenshots/multi-zip-results.png)、[部分失败](screenshots/multi-zip-partial.png) |
| 用户     | [列表](screenshots/design-users.png)、[详情与学习记录](screenshots/design-user-detail.png)                                                                                                                                               |
| 统计     | [三项统计](screenshots/design-statistics.png)                                                                                                                                                                                            |
| 适配     | [1366](screenshots/design-responsive-1366.png)、[1440](screenshots/design-responsive-1440.png)、[1920](screenshots/design-responsive-1920.png)                                                                                           |

截图已结束弹窗过渡动画；不含测试凭证。长页保持实际内容高度，不将长内容压缩到设计首屏。80个状态中的主页面及关键流程留有截图，其余映射至共用组件和原有状态分支，未声称80张逐像素截图全部验收。

## 与演示稿的有意差异

- 移除演示账号入口、载入示例包及模拟上传／转换按钮；保留真实模板下载、上传限制和处理说明
- 已发布卡片有未发布修改时不显示候选稿词汇数，避免把候选统计当作当前发布版；接口未提供发布版计数
- 联系来源只展示接口真实来源，未知历史来源显示“历史来源未核实”，不会套用演示稿“微信授权获取”已验证标签
- 全局排序契约没有最近修改时间，排序表格展示序号、卡片、状态和操作
- 音频卡保留原格式、播放副本及真实播放器；已有发布卡保留候选稿说明，因此编辑区的实际高度略多于演示首屏
- 本地Noto Sans SC字体原文件约17.8MB，保证任意业务中文可显示；首次下载成本高于子集字体，后续可单独优化压缩与缓存

## 复现方式

先启动隔离统一后端及worker，再在本工作树执行：

```sh
VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:18188 pnpm dev --host 127.0.0.1 --port 4188 --strictPort
JUYA_E2E_BASE_URL=http://127.0.0.1:4188 \
JUYA_E2E_CHANNEL=chrome \
JUYA_E2E_CREDENTIALS_FILE=/absolute/disposable/credentials.json \
JUYA_E2E_FIXTURES=/absolute/disposable \
JUYA_IMPORT_VERIFY_DIR=/absolute/disposable \
pnpm test:e2e
```

夹具目录需有测试图片 `scene.png`、完整音频 `dialogue.wav`，以及导入回归所用ZIP；设计巡检还需 `seed.json` 包含隔离卡片和用户ID。每次导入回归使用新数据库或新内容，真实重复识别会按预期跳过已成功导入的相同资料。测试时钟需正常递增；反复复用冻结时间的数据库，会让最近十条批次的时间排序落入UUID平局，无法代表正常时间下的最新操作历史。凭证、数据库和上传目录不提交。原有默认开发及部署配置保持不变。

## 独立审查与处理

对完整实施分支进行了一次独立代码审查，提出三项重要问题和一项播放提示问题，全部完成回归修复：导入预览统一复用ScenePreview；错误提示出现后正文自动收缩，footer保持可达；词汇三列、语块行和对话分隔样式完成；音频成功播放清除之前的拒绝提示。每项均观察到回归测试先失败再通过；修复后执行全量检查。没有待处理审查项。

[执行裁定和范围说明](decisions.md)保留全部实施／审查裁定及其代价。80状态清单中无截图的状态保留明确标记，不把映射等同逐帧视觉通过。

最终证据对应本轮修复后源码：71/71单元测试、12/12浏览器测试（34.5秒）、check及build通过。执行详情见 [执行记录](execution-ledger.md)。当前本地隔离预览为 `http://127.0.0.1:4188`，运行数据位于 `/tmp/juya-admin-figma-rev14-preview`，退出运行环境后该地址可能停止。

最后补查：将编辑区的1088px最大宽度明确应用到多根组件内的fieldset，并在最终样式上重跑4项设计浏览器回归、check与build，全部通过。该补查同时验证1366／1440／1920布局、音频控件、导入长预览、错误footer与紧凑编辑行。
