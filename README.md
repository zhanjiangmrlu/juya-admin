# 句芽英语管理后台

`juya-admin` 是句芽英语 V1.3 的单管理员内容与运营后台，覆盖登录页与 A01–A26。项目使用 Vue 3、TypeScript、Vite、Element Plus、Pinia、Vue Router、SCSS 和 ECharts，并按 `juya-admin-api` 契约处理用户、权益、反馈、内容生产、匿名统计与系统配置。

## 环境要求

- Node.js 22.22.x
- pnpm 11.22.0
- Chromium，仅端到端和视觉验收需要

## 安装与启动

### 1. 先启动管理 API

先安装并打开 Docker Desktop，等待 Docker Engine 就绪。在 PowerShell 执行：

```powershell
cd D:\个人\juya\juya-admin-api
docker compose -f .\docker-compose.dev.yml up --build -d
Invoke-RestMethod http://127.0.0.1:8000/health/ready
```

健康检查返回 `status: ready` 后再打开管理端。Compose 会启动 MySQL、Redis、API、Worker 和
Beat，并自动执行数据库迁移与本地管理员初始化。第一次构建需要下载镜像和依赖。
完整启动说明见 [juya-admin-api README](../juya-admin-api/README.md)。

### 2. 启动管理端

另开一个 PowerShell 终端，首次启动执行：

```powershell
cd D:\个人\juya\juya-admin
pnpm install
# 已有 .env.local 时保留现有配置
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

后续启动只需先启动后端，再在管理端目录执行同一条 `pnpm dev` 命令。保持前端终端运行，
关闭终端或按 `Ctrl+C` 会停止页面服务。`--strictPort` 会在 `5173` 被占用时报错，避免地址自动变化。

### 3. 打开页面并登录

浏览器访问 <http://127.0.0.1:5173/>
当前登录只需账号密码，无需 TOTP 动态验证码。登录成功后进入 `/dashboard` 工作台，
可通过左侧菜单查看各页面。这些账号信息仅适用于本地或测试环境；如果后端配置了
`JUYA_LOCAL_ADMIN_USERNAME`、`JUYA_LOCAL_ADMIN_PASSWORD`，请使用覆盖后的账号密码。

### 本地 API 代理

`VITE_API_BASE_URL` 在本地保持为空，请求会通过 Vite 的 `/api` 同源代理进入管理接口。代理默认连接 `http://127.0.0.1:8000`，只有后端使用其他地址时才覆盖：

```dotenv
VITE_API_BASE_URL=
VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8000
```

修改环境变量后需要重启 `pnpm dev`。不带端口参数时，地址以 Vite 输出为准；上面的启动命令固定
使用 `http://127.0.0.1:5173`。Playwright 验收固定使用 `http://127.0.0.1:4173`。

### 停止服务与常见问题

管理端在运行 `pnpm dev` 的终端按 `Ctrl+C` 停止。后端执行：

```powershell
cd D:\个人\juya\juya-admin-api
docker compose -f .\docker-compose.dev.yml stop
```

该命令保留数据库数据，下次可继续使用 `up --build -d` 启动。

- 空白页或服务不可用：确认 <http://127.0.0.1:8000/health/ready> 返回 `ready`，再刷新页面；工作台首次访问需要探测后端会话
- 登录失败：检查是否使用了后端覆盖后的本地账号密码，并查看后端 API 日志
- 后端启动脚本提示端口占用：如果是本项目的 MySQL 或 Redis 已运行，直接执行上述 Compose 命令；其他服务占用端口时需先解决冲突
- `5173` 已占用：已有本项目开发服务时直接访问它，否则先解决端口冲突再启动
- OSS 上传、OCR 或音频生产：还需要配置外部服务；默认本地 Compose 配置用于登录和页面查看

## Vercel 部署

仓库根目录的 `vercel.json` 配置了 Vite 构建、`dist` 输出目录和单页应用路由回退，直接访问或刷新 `/login` 等前端路由时不会返回 404。

在 Vercel 导入本仓库时，Root Directory 保持仓库根目录，Node.js 使用 `22.x`，并在 Production 和 Preview 环境设置 `ENABLE_EXPERIMENTAL_COREPACK=1`，以使用 `package.json` 锁定的 pnpm 版本。

也可以在项目根目录通过 CLI 发布：

```powershell
npx vercel login
npx vercel link --project juya-admin
npx vercel deploy --prod
```

后端尚未部署时，先访问部署地址的 `/login` 查看登录页；登录、会话恢复与业务数据操作需要真实的 `juya-admin-api`，Vite 的本地 API 代理不会在 Vercel 生效。

后续接通后端时，需要配置公网 HTTPS API 地址、Cookie/CSRF 与跨域策略，或为 `/api` 配置同源反向代理。`VITE_API_BASE_URL` 是构建时变量，修改后需重新部署；禁止在任何 `VITE_` 变量中放入密码或密钥。

## 常用命令

```powershell
pnpm dev                 # 启动开发服务
pnpm build               # 生成生产构建
pnpm check               # 格式、ESLint、Stylelint、TypeScript
pnpm test                # Vitest 单元与组件测试
pnpm test:e2e            # Playwright 主链路与 A01-A26 双视口验收
pnpm test:production     # 运行生产包，检查登录页渲染、脚本错误及认证链路
pnpm generate:api        # 根据固定 OpenAPI 快照重新生成类型
```

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
pnpm test:production
pnpm test:e2e --project=chromium
git diff --check
```

## V1.3 内容与音频（2026-10-01）

统一可视化草稿覆盖双语标题、原图、对话、词库、语块和版权来源；整段音频逐句毫秒标时与试听确认后发布。OCR 默认关闭且按字段采纳；上传重试保留命令键，保存期间锁定编辑防止输入丢失。手机和平板内容预览使用真实资源，发布固定内容版本。正式期限使用小写枚举，批量任务展示逐项结果，统计区分独立活跃人数和人日。

当前门禁：check、构建、234 个单元测试及 97 个 Chromium 用例通过，覆盖 1440×900 和 1280×800。真实服务联调后台地址为 http://127.0.0.1:18173；OSS 浏览器直传 CORS 和供应商验收尚待配置，详见 [交付记录](../juya-admin-api/docs/implementation/v13-content/evidence.md)。小程序前端本轮没有修改。
