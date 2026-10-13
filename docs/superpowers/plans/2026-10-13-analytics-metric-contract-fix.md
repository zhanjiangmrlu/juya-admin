# 统计指标契约修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 修复测试后台因合法短文指标被拒绝而清空统计，并补齐同批遗漏指标。

**Architecture:** 同步既有匿名统计白名单、中文标签和内容维度；保留未知指标、个人标识及非法数值的失败关闭校验。后端已将周/月去重结果归一为 ACTIVE_USERS，沿用现有页面逻辑。

**Tech Stack:** Vue 3、TypeScript、Vitest、Playwright、Vite、现有 ECS 静态发布脚本。

**Spec:** 用户已确认一起处理四个指标和相关维度、构建并部署测试前端；契约依据为 `../juya-admin-api/src/juya_admin_api/modules/analytics/service.py` 的 EXPORTABLE_METRICS、is_anonymous_dimension 和 query_aggregate_rows。

## Global Constraints

- 保持当前 test 分支；只提交本次统计修改，中文 Conventional Commit
- 补齐 SHORT_READING_STARTS、SHORT_READING_COMPLETIONS、WEEK_ACTIVE_USERS、MONTH_ACTIVE_USERS
- 内容维度新增 short_reading 前缀，继续拒绝个人标识及非法路径
- 使用 build:test，构建实际 API 地址为 https://test-admin-api.juyayingyu.com
- 仅发布 juya-admin 测试前端

## Review Focus

- 短文指标值为零仍应合法，整份统计及导出保留
- 短文内容维度允许合法 ID，含个人标识或路径分隔符仍拒绝
- 周/月活跃指标有明确中文标签；实际 API 的 ACTIVE_USERS 归一行为保留
- 图表及导出均经过现有匿名校验
- 线上新资产与真实统计响应对应，浏览器验证不可由构建代替

### Task 1: 同步匿名统计契约并发布测试前端

**Files:**

- Modify: `src/features/analytics/analytics-model.ts`
- Test: `src/features/analytics/analytics-model.spec.ts`
- Test: `src/features/analytics/analytics-adapter.spec.ts`
- Test: `tests/e2e/analytics-summary.spec.ts`

**Interfaces:** 保留 validateAnalyticsRows、groupAnalyticsRows、createAnalyticsAdapter 的签名和现有页面/API 接口。

- [x] 增加四指标、短文维度、个人标识拒绝、中文趋势标签及页面展示/导出回归
- [x] 运行定向 Vitest 和新增 E2E，确认未知指标/维度拒绝导致失败
- [x] 最小修改白名单、标签和维度前缀；确认定向测试通过
- [x] 运行完整 check、Vitest、统计 E2E，并复核服务器匿名数据快照
- [x] 请求独立代码审查，处理必要问题并提交
- [ ] 使用现有脚本构建并发布 juya-admin 测试前端
- [ ] 核对线上资产、真实统计查询及浏览器展示/导出

## Execution Evidence

- Baseline: test 分支 094d54f；工作区干净
- Reproduction: 2026-09-14 至 2026-10-13 查询返回 138 行和 17 条比率，validateAnalyticsRows 返回“统计响应包含未知指标”
- Scope decision: 后端 query_aggregate_rows 已将 WEEK_ACTIVE_USERS/MONTH_ACTIVE_USERS 归一为 ACTIVE_USERS，不修改顶部卡片
- TDD: 新增测试在修复前 6 项失败；修复后定向单测 33/33、统计页面 E2E 4/4 通过
- Gates: pnpm check 通过，110 个测试文件、412 项测试通过；服务器 138 行快照从拒绝变为通过
- Review: 独立审查未发现 Critical / Important / Minor 问题
