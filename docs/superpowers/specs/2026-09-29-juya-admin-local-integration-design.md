# juya-admin 本地真实联调设计

## 1. 背景与目标

当前 `juya-admin` 在未配置 API 地址时会把 `/api/v1/admin/**` 请求发送给 Vite 开发服务器。Vite 未配置代理，因此登录请求由 `localhost:5173` 返回 404。同时本机没有 Docker、MySQL 或 Redis，`juya-admin-api` 的 8000 端口也没有服务。

本次改造的目标是提供一条可重复执行的本地真实联调路径：使用 Docker Compose 启动管理 API 及其真实 MySQL、Redis 和迁移流程，自动初始化仅限本地使用的管理员，通过 Vite 同源代理访问 API，并以真实 HTTP 完成密码与 TOTP 登录验证。

## 2. 已确认方案

- 使用 Docker Desktop 运行仓库已有的 `docker-compose.dev.yml`
- 不新增前端 mock API，不把测试 fixture 当作开发服务
- 前端继续使用相对路径 `/api/v1/admin/**`，由 Vite 代理到 `http://127.0.0.1:8000`
- 后端增加幂等的本地管理员初始化进程，仅在 `JUYA_ENVIRONMENT=local|test` 时允许执行
- 增加 PowerShell 一键启动脚本，负责前置检查、容器启动、就绪等待和本地登录信息输出
- 所有生产部署配置和生产认证规则保持不变

## 3. 组件与改动边界

### 3.1 juya-admin

- `vite.config.ts`：仅在开发服务器中代理 `/api`，目标默认是 `http://127.0.0.1:8000`
- 环境变量：允许通过 `VITE_DEV_API_PROXY_TARGET` 覆盖代理目标；`VITE_API_BASE_URL` 在本地代理模式下保持为空
- 自动化测试：加载最终 Vite 配置并断言代理路径、目标和 Cookie 所需的同源行为
- `README.md`：记录前后端启动顺序和健康检查方式

生产构建不会携带开发代理。页面与 API client 仍使用既有相对接口路径，不改变生产部署方式。

### 3.2 juya-admin-api

- `scripts/start-local.ps1`：检查 Docker CLI 与 Docker Engine，执行 Compose 构建和启动，轮询 `/health/ready`
- 本地管理员初始化模块：读取本地专用环境变量，使用与正式认证相同的密码哈希算法，幂等创建或更新管理员
- `scripts/entrypoint.ps1` 与 `scripts/entrypoint.sh`：增加 `seed-local-admin` 进程角色
- `docker-compose.dev.yml`：在数据库迁移后运行一次管理员初始化，API 在初始化成功后启动
- `README.md`：记录一键启动、停止、重建和登录方式

## 4. 本地管理员策略

Compose 本地环境使用以下可覆盖变量：

- `JUYA_LOCAL_ADMIN_USERNAME`：默认 `admin`
- `JUYA_LOCAL_ADMIN_PASSWORD`：默认 `JuyaLocal@2026`
- `JUYA_LOCAL_ADMIN_TOTP_SECRET`：默认测试专用 Base32 密钥 `JBSWY3DPEHPK3PXP`

初始化命令必须满足：

1. 仅允许 `JUYA_ENVIRONMENT` 为 `local` 或 `test`
2. 缺少数据库地址、用户名、密码或 TOTP 密钥时直接失败
3. 首次执行创建管理员，再次执行更新密码、TOTP 和启用状态，不创建重复账号
4. 日志只显示用户名和本地 TOTP 配置说明，不输出密码哈希或数据库连接密钥
5. 生产 Compose 和 ECS 部署不包含该进程

TOTP 密钥在本地环境允许按现有运行时规则明文保存；生产环境仍要求加密密钥，不复用本地默认值。

## 5. 请求与认证数据流

```text
浏览器 localhost:5173
  → POST /api/v1/admin/session
  → Vite 开发代理
  → juya-admin-api:8000
  → MySQL 管理员认证
  → Redis 会话与防重放能力
```

浏览器始终看到 `localhost:5173` 的同源响应，避免直接跨域调用带来的 CORS 问题。代理转发后端 `Set-Cookie`，现有 HttpOnly、Secure、SameSite 和 CSRF 设计不在前端降级。

## 6. 启动与失败处理

一键脚本按以下顺序执行：

1. 检查 `docker` 与 `docker compose`
2. 检查 Docker Engine 是否可用
3. 启动 MySQL 和 Redis 并等待健康状态
4. 执行 Alembic 迁移
5. 初始化本地管理员
6. 启动 API、Worker 和 Beat
7. 轮询 `/health/ready`，超时后输出 `docker compose ps` 和 API 日志提示

Docker Desktop 未安装、Engine 未启动、端口 3306/6379/8000 冲突、迁移失败或管理员初始化失败时，脚本必须返回非零退出码并给出下一步操作，不静默继续。

## 7. 测试策略

采用测试先行并保留红绿证据：

- 前端配置测试先证明当前没有 `/api` 代理，再实现代理配置
- 后端单元测试覆盖本地环境限制、首次创建、幂等更新和缺少变量失败
- Compose 静态测试覆盖 `migrate → seed-local-admin → admin-api` 依赖顺序
- PowerShell 脚本至少进行语法和缺少 Docker 的失败提示测试
- 两个仓库分别运行完整静态检查、单元测试和构建门禁
- 最终启动真实容器并验证：
  - `GET /health/ready` 返回 200 且依赖均就绪
  - `POST http://localhost:5173/api/v1/admin/session` 不再返回 Vite 404
  - 密码验证返回 challenge
  - 使用当前 TOTP 完成登录并取得 CSRF token

## 8. 安装与系统影响

Docker Desktop 通过 `winget` 安装。安装属于本机系统变更，可能触发管理员确认、WSL 2/虚拟化组件启用或系统重启。代码改动可以在安装期间完成；若安装要求重启，则保留已提交改动，并在重启后继续容器与真实 HTTP 验证。

不会删除现有 Docker volume。停止本地环境使用 `docker compose stop`；只有用户明确要求清空本地数据时才执行带 `--volumes` 的清理命令。

## 9. 完成标准

- `juya-admin` 与 `juya-admin-api` 均在各自 `main` 分支形成中文 Conventional Commit
- 前端开发请求通过同源代理进入 8000 端口
- 一条 PowerShell 命令可以启动完整本地后端
- 本地管理员可完成密码与 TOTP 登录
- 健康检查、前端检查、后端检查及真实 HTTP 验证有新鲜通过证据
- 两个仓库工作树干净，后台长期服务保持运行供继续调试
