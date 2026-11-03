# 管理模块 Element Plus 本地验证

日期：2026-11-03。分支：`test`，基于`4f46cc6`增量实施。开发验证阶段未提交、推送、部署或改写真实业务数据，API及小程序仓库未修改。用户随后明确授权本次源码提交并推送远程`test`，本次不部署。本地帐密及请求来源调整保存在私有配置，不纳入Git。

## 已实施

- 用户列表/详情、数据统计、反馈列表/详情及关联授权、学习记录、回复、截图和弹窗切换为现有Element Plus组件
- 局部管理主题与中文配置；AppState展示模式可选，默认模式及其他页面保留原实现；共用场景阅读器仅调整弹窗管理按钮
- 搜索、筛选、分页、返回滚动、日期字符串、统计缺失值、授权确认、反馈Unicode计数/草稿/水位/恢复继续使用原业务语义
- 修正旧浏览器用例的注册筛选选择器与固定第2页Mock；未放宽原路由、滚动或业务断言

## 最终验证

- `pnpm test`：59文件、273项通过（27.59秒）；jsdom媒体pause提示属于已有测试环境能力提示
- `pnpm check`：Prettier、ESLint、Stylelint及双TypeScript检查通过
- `pnpm build`：通过
- `JUYA_E2E_CHANNEL=chrome pnpm exec playwright test tests/e2e/revision15-existing-regression.spec.ts tests/e2e/feedback.spec.ts tests/e2e/management-element-plus.spec.ts`：11项通过（9.7秒）
- E2E覆盖显式/浏览器返回与迟到响应、统计前台刷新/失败/0值、反馈会话草稿和离页、500/501 Unicode计数、取消状态、私图续签及自定义预览、授权日期字符串且取消不提交

## 视觉及独立复查

修改前保存五页面在1366×900、1440×1000、2557×1268下的15张基线，修改后同一合成数据重新截图并目视对照。截图位于工作区`.private/management-element-plus-20261103/{before,after}`，未使用真实账号。最终`after/geometry.json`确认15种页面/视口组合均无页面级横向溢出，用户行124px、反馈行93px、统计卡片208.39px。不是自动全像素一致率验收。

独立审查指出截图按钮40px裁切100px图片与反馈hover颜色偏差，均先复现再修复，并增加图片完整容纳与浅绿hover浏览器断言。返回用户列表的ElTable列注册二轮渲染问题已修复，650px滚动恢复通过；原query/激活/generation保护保留。独立复查无剩余确定P1/P2。

浏览器及组件验证采用隔离合成响应，不计为真实服务端、真实授权变更或生产验收。
