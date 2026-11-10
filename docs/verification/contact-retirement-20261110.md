# CHG0039 后台联系资料退役验证（2026-11-10）

本轮仅本地 `test` 分支实现，未推送、部署或修改 Figma。OpenAPI 与生成类型由主任务同步，页面实现提交不包含这两个生成文件。

## 变更与保留行为

- 用户列表移除联系方式列、来源标签与旧提示；搜索只提示「搜索用户编号或昵称」。删除不再有生产引用的 `contactSourceText` 及对应旧测试。
- 详情账号资料移除手机号、微信号与联系来源提示；用户编号、微信身份登录、注册／最近登录／最近学习、两类统计、收藏、打卡、学习记录、授权管理和审计保留。
- 零结果仍使用 `ElTable`，保留八列表头与筛选；表体通过 `ElEmpty` 显示「没有符合条件的用户」「试试其他用户编号或昵称，或清空筛选后查看。」及「清空筛选」。显示「匹配 0 位用户」，分页保留且前后页禁用。清空后回到第一页，并保留统计页来源。
- 列表仍按 UUID 进入详情，稳定用户编号只用于展示；返回恢复搜索、三类筛选、页码与滚动位置。授权未知结果继续走原回执恢复，未改写授权实现。

## 设计与截图

已先加载 `figma-design-to-code`，读取三节点完整高保真上下文和截图，对照后实现；没有调用 Figma 写工具。

| 页面       | 设计节点                                                                         | 设计截图                                                                     | 本地截图                                                                     |
| ---------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 用户列表   | [45:13777](https://www.figma.com/design/yVnE9TCSoRS5sv4vAuxsBX?node-id=45-13777) | [design-user-list.png](contact-retirement-20261110/design-user-list.png)     | [actual-user-list.png](contact-retirement-20261110/actual-user-list.png)     |
| 用户详情   | [45:14019](https://www.figma.com/design/yVnE9TCSoRS5sv4vAuxsBX?node-id=45-14019) | [design-user-detail.png](contact-retirement-20261110/design-user-detail.png) | [actual-user-detail.png](contact-retirement-20261110/actual-user-detail.png) |
| 无匹配用户 | [365:4863](https://www.figma.com/design/yVnE9TCSoRS5sv4vAuxsBX?node-id=365-4863) | [design-user-empty.png](contact-retirement-20261110/design-user-empty.png)   | [actual-user-empty.png](contact-retirement-20261110/actual-user-empty.png)   |

截图宽度均为 1440；列表与空状态视口为 1440×1025，详情为全页截图。截图禁用动画，等待本地字体加载。空状态 36×36 搜索图标由本次 Figma 资产原样下载到 `src/assets/icons/empty-search.svg`，浏览器验证非空、加载成功及实际 36×36 几何尺寸；既有导航、刷新、搜索及用户图标继续复用原本地 `AppIcon` 资产。没有将设计截图或临时 Figma URL 用作运行资产。

对照范围为本次联系字段移除、用户表格列重排及空表体：搜索宽 320、高 40，筛选宽 142，表头高 47，空表体保留 375 高，内容组高 330，图标 36、标题 18、提示 13、清空按钮 114×40，沿用项目色彩变量。旧页面中导航图标细节、Element Plus 分页按钮外观、多页数字、时间行排版和详情各面板间距仍存在既有差异，本轮未重做这些无关样式。夹具用户均显示有效授权及相同统计；设计包含不同授权和不同学习记录，数据差异不作为像素一致声明。详情夹具无学习记录，实际截图显示已有空学习记录状态，不能证明设计内两条听读记录正文已验收。

## 验证

工具链：现有 `.tools/node-v22.23.3-darwin-arm64/bin` 的 Node 22.23.3、pnpm 11.25.0；使用本机 Chrome 通道，无依赖升级。

```sh
export PATH=/Users/lubi/Desktop/juya/.tools/node-v22.23.3-darwin-arm64/bin:$PATH
pnpm check
pnpm test
pnpm build
JUYA_E2E_CHANNEL=chrome pnpm test:e2e tests/e2e/contact-retirement.spec.ts tests/e2e/management-element-plus.spec.ts
```

- 测试先行：先新增真实 Vue／Element Plus 页面行为断言，旧实现出现 4 个预期失败（列表仍展示联系资料、详情仍展示联系资料、无匹配时表头消失、零结果总数文案），实现后通过。
- `pnpm check`：格式、ESLint、Stylelint、Vue／TypeScript 检查通过。
- `pnpm test`：61 文件、309 项通过。包括列表显式返回／浏览器历史返回、迟到响应不滚动详情、服务端页码回退，以及原授权未知回执恢复／冻结重试测试。jsdom 仍输出已有 HTMLMediaElement.pause 未实现提示，测试无失败。
- `pnpm build`：生产构建通过。
- 相关 Playwright：4 项通过，覆盖空状态保留与筛选清空、详情身份／学习／授权／审计保留、筛选分页滚动恢复、授权日期确认以及窄屏固定操作列。
- 浏览器新流程记录的 `pageerror` 为空。首次默认 Chromium 启动因本地缺少对应 headless shell 失败，改用既有 Chrome 后通过；未安装或升级浏览器。

边界：Playwright 在本地 Vite 页面使用独立的合成管理员会话和接口路由夹具，未读取账号文件、连接远程服务或改动本地业务数据。单元测试额外向页面传入旧联系字段，验证即使收到历史值也不展示。这里的页面证据不替代真实后端删字段、历史数据清除、真实登录、API 联调或生产验收；这些由主任务在 API／全局验证记录中独立报告。
