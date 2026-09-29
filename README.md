# 句芽英语管理后台

`juya-admin` 是句芽英语 V1.3 的单管理员内容与运营后台，覆盖登录页与 A01–A26。项目使用 Vue 3、TypeScript、Vite、Element Plus、Pinia、Vue Router、SCSS 和 ECharts，并按 `juya-admin-api` 契约处理用户、权益、反馈、内容生产、匿名统计与系统配置。

## 环境要求

- Node.js 22.22.x
- pnpm 11.22.0
- Chromium，仅端到端和视觉验收需要

## 安装与启动

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

本地开发先在 `D:\个人\juya\juya-admin-api` 启动真实管理接口：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

`VITE_API_BASE_URL` 在本地保持为空，请求会通过 Vite 的 `/api` 同源代理进入管理接口。代理默认连接 `http://127.0.0.1:8000`，只有后端使用其他地址时才覆盖：

```dotenv
VITE_API_BASE_URL=
VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8000
```

修改环境变量后需要重启 `pnpm dev`。本地开发地址由 Vite 输出，Playwright 验收固定使用 `http://127.0.0.1:4173`

## 常用命令

```powershell
pnpm dev                 # 启动开发服务
pnpm build               # 生成生产构建
pnpm check               # 格式、ESLint、Stylelint、TypeScript
pnpm test                # Vitest 单元与组件测试
pnpm test:e2e            # Playwright 主链路与 A01-A26 双视口验收
pnpm generate:api        # 根据固定 OpenAPI 快照重新生成类型
```

## 云效测试环境部署

代码托管在 GitHub，云效 Flow 按分支隔离环境：

| GitHub 分支 | 目标环境 | ECS 发布目录                 | 当前状态                   |
| ----------- | -------- | ---------------------------- | -------------------------- |
| `test`      | 测试     | `/opt/juya-admin/test`       | 本次启用                   |
| `main`      | 生产     | `/opt/juya-admin/production` | 尚未配置、脚本主动拒绝发布 |

本次流水线定义在 `.aliyun-ci.yml`，只允许 `test` 分支构建。质量门禁固定使用 Node.js 22.22.0 与 pnpm 11.22.0，依次执行依赖锁定安装、静态检查、测试和构建，然后把 `dist/` 与 `deploy/` 作为 `juya_admin_test_web` 制品发布到测试主机组。

首次配置云效前需要准备：

- 已授权访问本 GitHub 仓库的云效代码源服务连接，并把 Flow 代码源分支限定为 `test`
- 包含测试 ECS `8.163.84.24` 的云效主机组，把主机组 ID 配置为流水线变量 `ECS_TEST_MACHINE_GROUP_ID`
- ECS 安全组允许入方向 TCP 80；操作系统已安装并启用 Nginx
- 云效主机部署使用 `root`，或等价的最小权限账号：可写 `/opt/juya-admin/test` 和 Nginx 站点配置，并可执行 `nginx -t` 与平滑重载

流水线使用云效内置变量 `CI_COMMIT_REF_NAME`、`CI_COMMIT_SHA` 和 `BUILD_NUMBER` 生成唯一版本号；ECS 发布脚本再次验证 `test → test` 映射，校验 Nginx 配置和 HTTP 健康检查后才切换 `current` 软链接，失败时自动恢复上一版本。

部署成功后前端测试地址为 `http://8.163.84.24/`。`juya-admin-api` 尚未部署时，`/api/` 请求会明确返回 HTTP 503，页面静态资源仍可独立验收。

首次运行 Playwright 前安装项目对应的 Chromium：

```powershell
pnpm exec playwright install chromium
```

## 工程结构

```text
src/
├─ app/                 路由元数据、导航与认证守卫
├─ components/          数据表、状态、确认、审计、图表等业务组件
├─ features/            按业务域组织的模型、adapter 与 composable
├─ layouts/             管理后台侧栏、顶栏与内容区
├─ pages/               登录页与 A01-A26 路由页面
├─ services/            API、认证客户端与上传服务
├─ shared/              生成契约、错误、命令和常量
└─ styles/              设计令牌、Element Plus 覆盖与全局样式
tests/
├─ e2e/                 登录、敏感查询、高风险命令与冲突回归
└─ visual/              A01-A26 页面清单、双视口溢出与截图验收
```

页面通过 `feature composable → adapter → API client → juya-admin-api` 访问数据。页面不直接使用生成 DTO；服务端状态、版本、期限和待办顺序始终是事实来源。

## API 与安全约束

- OpenAPI 快照位于 `openapi/admin-api.json`，生成结果位于 `src/shared/contracts/generated/admin-api.d.ts`
- 登录采用管理员账号和密码，认证 Cookie 由浏览器管理，CSRF token 只保存在内存 Store
- 写请求自动携带 `X-CSRF-Token`，高风险命令额外携带 `X-Idempotency-Key`
- 整页刷新后通过独立会话接口校验 HttpOnly Cookie，并轮换、恢复仅存于内存的 CSRF token
- 完整微信号通过 POST 正文检索，不进入 URL、localStorage 或 sessionStorage
- A02–A04 已接入五种联系状态筛选与更新、完整联系元数据、学习概况、审计后复制，以及联系更正列表、详情、批准和拒绝
- 联系更正决定使用 `X-Idempotency-Key`；409 保留当前详情并提示刷新，批准只重置一次用户自助修改机会
- 401 会清理敏感状态并跳转登录页；409 保留本地草稿并展示服务端新版本

## 能力边界

接口文档已覆盖的能力使用真实 adapter，包括认证、配置、审计、用户与联系资料、待办、匿名统计、正式与限时权益命令、反馈命令、媒体上传、发布检查和开放场景配置。

第一批用户与联系资料接口已经完整接入：A02 可按联系状态筛选并切换更正申请列表，A03 展示学习概况并执行联系命令与审计复制，A04 可批准或拒绝修改机会申请。生产阿里云 OSS 不属于本批次，按后续独立批次接入。

文档尚未提供的列表或命令保持明确的“接口待接入”状态，不发送未知请求，也不以本地演示数据伪造成功结果。具体边界见 [开发设计](./docs/superpowers/specs/2026-09-28-juya-admin-v1-design.md)

## 样式与注释规范

- UI 基础组件统一使用 Element Plus
- 页面和组件使用 `<style scoped lang="scss">`
- 类名使用简洁语义命名，在页面根类下用 SCSS 嵌套组织，不使用 BEM
- 颜色、间距、圆角和布局尺寸优先使用 `src/styles/tokens.scss` 中的令牌
- 函数注释说明用途、每个参数和返回值，注释末尾不加句号

## 验收说明

`pnpm test:e2e` 包含 7 条核心业务链路和 A01–A26 在 1440×900、1280×800 两个视口下的 52 项页面验收。视觉测试会检查页面级横向溢出和纯图标按钮的可访问名称，并把本地截图写入被 Git 忽略的 `.impeccable/review/`

提交前执行完整门禁：

```powershell
pnpm check
pnpm test -- --maxWorkers=1
pnpm build
pnpm test:e2e --project=chromium
git diff --check
```
