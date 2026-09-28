# juya-admin V1.3 Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 A01–A26 交付完整的句芽英语单管理员后台，并在后端接口不完整的前提下保持真实联调和明确的待接入边界。

**Architecture:** 采用五个连续且可独立验收的实施计划。每个计划都在前一个计划的稳定接口上构建，并以测试、质量门禁和中文 Git 提交结束。

**Tech Stack:** Vue 3.5、TypeScript、Vite、Vue Router、Pinia、Element Plus、SCSS、Vitest、Vue Test Utils、Playwright、dayjs、ECharts。

**Spec:** `docs/superpowers/specs/2026-09-28-juya-admin-v1-design.md`

## Global Constraints

- 直接在 `main` 分支执行，不创建开发分支或工作树。
- 所有新增命名函数、composable、事件处理器和业务方法必须写 TSDoc/JSDoc；每个参数用 `@param` 描述，返回值用 `@returns` 描述。
- UI 组件使用 Element Plus，但通过设计令牌和业务封装还原 A01–A26，不交付默认 Element Plus 页面。
- 页面样式使用 `<style scoped lang="scss">`，并在页面根类下嵌套。
- 生产代码不得包含演示数据或伪造成功结果；测试夹具仅存在于测试目录。
- 当前 OpenAPI 未提供的能力返回 `pending`，不得发送未知请求。
- 文件和目录使用 `kebab-case`；生成契约目录除外。
- 1440×900 为视觉基准，1280×800 为回归尺寸。
- 每个任务在提交前运行该任务的聚焦测试；每个计划末尾运行 `pnpm check && pnpm test && pnpm build`。
- Git 提交说明使用 `feat: 中文描述`。

## Review Focus

- 管理员会话失效时必须清空敏感内存并回到登录页，不保留上一个敏感页面状态。
- 微信号搜索值不得进入 URL、浏览器存储、日志或错误消息。
- `pending` 能力不得发出网络请求，也不得显示成功反馈。
- 重复点击高风险命令只能复用同一次提交的幂等键，新的业务操作必须生成新键。
- 1280×800 下页面整体不得产生横向滚动，表格只能在自己的容器中滚动。

## Execution Order

1. [阶段一：基础框架、认证、工作台与用户](2026-09-28-juya-admin-phase-1-foundation-users.md)
2. [阶段二：权益、活动与消息中心](2026-09-28-juya-admin-phase-2-entitlements-campaigns.md)
3. [阶段三：问题反馈闭环](2026-09-28-juya-admin-phase-3-feedback.md)
4. [阶段四：内容生产与发布](2026-09-28-juya-admin-phase-4-content-production.md)
5. [阶段五：统计、配置与全量验收](2026-09-28-juya-admin-phase-5-analytics-acceptance.md)

页面覆盖清单：A01、A02、A03、A04、A05、A06、A07、A08、A09、A10、A11、A12、A13、A14、A15、A16、A17、A18、A19、A20、A21、A22、A23、A24、A25、A26。
