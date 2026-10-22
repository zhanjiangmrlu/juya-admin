# 修订15批6 · 后台既有功能关键回归

日期：2026-10-22（北京时间）。分支 `codex/rev15-regression`，基线 `203e89a67db7af49f338bdf414c8c28d6a593546`。范围T64、T73、T74、T77、T97—T107；未修改导入恢复、分享、Mini、总ledger或matrix。

## 实现与红绿证据

### T74用户列表返回位置（P2）

修复前在真实UserListPage／UserDetailPage及KeepAlive容器中，明确“返回用户列表”和浏览器返回均得到`scroll=0`，预期`650`，两项失败。搜索、注册筛选、打卡筛选、第2页和统计来源当时已正确保留。

用户列表复用既有反馈列表模式：离开前记位置，激活后刷新并在nextTick后恢复，使用active、完整query与scrollGeneration三重守卫。更改条件或重复提交查询归零；离页时使迟到恢复失效。没有修改全局router滚动规则。

### T106慢请求跨日前台刷新（P2）

修复前模拟服务端捕获10-21的旧快照但延迟响应，请求中派发focus＋visibilitychange；旧请求成功或失败后GET次数均为1，预期2，两项失败。与T74合计定向RED为**4失败／8通过**。

统计页保留一次请求中的前台重查意图，当前请求结算后读取新服务端日期；重复事件合并，成功与失败都排队重查，卸载后不再启动。修复后用户／统计定向组件**12通过**。

### T64／T77预览展示与只读边界

按基线16.1补“中央查词（预览）”禁用按钮与说明，不展示虚构词义，不调用Mini正文词典。分享、反馈、学习开始与来源队列继续隐藏；收藏、完成继续禁用。draft才有确认发布，published／import不提供该按钮。

新增真实ScenePreview＋SceneReader＋SceneAudio＋Element Plus组件回归，未替换业务预览组件。三模式各覆盖关闭时单词音轨／完整音频两种情况，共**6项**；先见缺少查词禁用控件的RED（3项失败），补展示后通过。验证译文默认收起及切换、大图、管理员受控词汇POST和版本引用、音频启动及关闭停音。允许唯一合法管理员试听POST，所有API路径均为admin，无Mini收藏／完成／成绩／词典请求。仅浏览器音频硬件和网络为测试边界替身。

## 无需改业务的补证

- T97／T105：首次读取无假0，真实0三卡可点击；首次503显示暂未获取、无metric-value且禁点，可重试；旧值刷新503保留数字与日期并标“暂未更新”
- T100—T102：三指标分别进入`users?registered=all&checkin=all&from=statistics`、`users?registered=today&checkin=all&from=statistics`、`cards?status=published&from=statistics`，清除旧搜索／页码
- T107：统计显示8人后模拟列表查询时已新增至9人，实际列表取9；返回A07重查后显示9和新的更新时间，不用旧统计凑列表
- API对应8项专项覆盖T73六交集、T98／T99／T106注册UTC15:59:59／16:00:00与重登、T103／T104发布生命周期统计；API全量281通过／12真实依赖条件跳过，见API同名文档

## 设计读取与视觉核对

已读本地确认方案、需求基线、完整需求、设计对照、修订15变更说明及原型相关流程。Figma首个工具调用暂不可用，重试恢复后读取具体草稿预览帧`282:6250`和截图；该帧返回稀疏metadata后继续读取对话区`282:6891`及发布页脚`282:7130`高保真上下文。未读取根画板巨量metadata。

对话／页脚沿用既有Vue、SCSS、字体、色彩token与组件；该Figma帧未展示查词入口，新增禁用示例依据基线16.1，不冒称设计已有该控件。本批未新增静态资产，图片与音频仍为对应版本动态资源；设计截图仅用于核对，没有成为页面资产。实际Chrome发布预览截图已人工查看，禁用说明与译文布局无重叠；整屏及其他既有差异未扩展修复。

## 最终执行结果

使用本worktree独立node_modules，Node路径为工作区`.tools/node/bin`，Vite独占本批`127.0.0.1:4197`。所有Chrome API请求由测试拦截，未定义请求也不进入真实代理。

- `pnpm test`：**34文件／121项通过**
- `pnpm check`：Prettier、ESLint、Stylelint、vue-tsc及tsc通过
- `pnpm build:test`：通过
- `JUYA_E2E_BASE_URL=http://127.0.0.1:4197 JUYA_E2E_CHANNEL=chrome pnpm exec playwright test tests/e2e/revision15-existing-regression.spec.ts`：**7项通过**
- 独立只读代码审查：未发现Critical／Important问题

Chrome覆盖明确／浏览器返回650px、改变筛选归零、保留A07返回、迟到列表响应不滚动下一详情、旧日慢响应成功／失败后合并前台重查、零值与两类503及三指标目标、查询间数据变化后返回刷新、A06实际发布预览无Mini流量。截图位于忽略目录`test-results/revision15-batch6-published-preview.png`。

收尾查服务日志发现Chrome合成夹具把两个批次集合接口返回成分页对象，卡片列表因而出现`managementBatches.value.some is not a function`。先补所有用例的页面未捕获异常断言，原夹具出现预期RED；随后改为契约要求的空数组并重跑7项。最终通过包含零页面异常断言，没有为这个测试数据错误修改业务代码。

完整单元日志仍有既有`scene-media-field.spec.ts`的7条jsdom `HTMLMediaElement.pause()`未实现提示，测试通过；本批实际预览专项无此提示。依赖安装的simple-git-hooks在worktree `.git`文件形态下报告ENOTDIR，但安装及后续检查完成；提交前会使用既有Git hook验证结果，不修改主工作区依赖。

本记录只证明上述断言，未把全量绿色换算成T01—T147全部完成；未重跑依赖真实服务的历史全部E2E。未连接业务库或协调者18216／18215，未操作18195／18196／4185／4186。真实MySQL／Redis联调、微信云能力与真机播放由总协调另验；合成Chrome、SQLite与构建不记作真实云或真机通过。仅本地提交，不推送、部署或上传体验版。
