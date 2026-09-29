# juya-admin Local Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `juya-admin` 通过同源开发代理连接由 Docker Compose 启动的真实 `juya-admin-api`，并使用幂等初始化的本地管理员完成密码与 TOTP 登录

**Architecture:** 前端保留相对 API 路径，仅由 Vite 开发服务器代理 `/api` 到 8000 端口。后端沿用现有 MySQL、Redis、Alembic 和认证实现，新增只允许 local/test 的管理员初始化进程及 PowerShell 编排入口；生产 Compose、ECS 配置和认证规则不变

**Tech Stack:** Vue 3、Vite 8、Vitest、FastAPI、SQLAlchemy 2、MySQL 8.4、Redis 7.4、Alembic、Docker Compose、PowerShell、pytest

**Spec:** `docs/superpowers/specs/2026-09-29-juya-admin-local-integration-design.md`

## Global Constraints

- 直接在 `juya-admin` 和 `juya-admin-api` 各自当前 `main` 分支开发，不创建 worktree
- 提交说明使用中文 Conventional Commit
- 前端继续使用 `VITE_API_BASE_URL=` 和相对 `/api/v1/admin/**` 路径
- 开发代理默认目标固定为 `http://127.0.0.1:8000`，只允许 `VITE_DEV_API_PROXY_TARGET` 覆盖
- 本地管理员默认账号为 `admin`，密码为 `JuyaLocal@2026`，TOTP 密钥为 `JBSWY3DPEHPK3PXP`
- 本地管理员初始化只允许 `JUYA_ENVIRONMENT=local|test`
- 新增函数必须有用途、参数和返回值注释，注释末尾不加中文句号
- 不修改生产 ECS Compose，不降低 HttpOnly、Secure、SameSite 或 CSRF 规则
- 不执行带 `--volumes` 的 Docker 清理命令

## Review Focus

- `VITE_DEV_API_PROXY_TARGET` 带尾部斜杠或为空时，代理仍应得到无尾斜杠的有效目标；Task 1 覆盖
- 在 `staging` 或 `production` 误执行初始化时，必须在连接数据库前失败；Task 2 覆盖
- 管理员已存在且处于禁用或锁定状态时，再次初始化应恢复为可登录状态且不新增重复账号；Task 2 覆盖
- Docker 未安装、Engine 未启动或 8000 端口冲突时，启动脚本必须给出可执行提示并返回非零状态；Task 4 覆盖
- Compose 首次构建较慢或迁移失败时，脚本不得提前报告成功，必须以 `/health/ready` 和容器状态为准；Task 4 与 Task 6 覆盖

---

### Task 1: 前端同源开发代理

**Files:**

- Create: `src/app/dev-api-proxy.ts`
- Create: `src/app/dev-api-proxy.spec.ts`
- Modify: `vite.config.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**

- Consumes: `VITE_DEV_API_PROXY_TARGET?: string`
- Produces: `createDevApiProxy(target?: string): Record<string, ProxyOptions>`，供 `vite.config.ts` 的 `server.proxy` 使用

- [ ] **Step 1: 写开发代理失败测试**

  在 `src/app/dev-api-proxy.spec.ts` 断言默认目标为 `http://127.0.0.1:8000`、`changeOrigin=true`，空白目标回退默认值，自定义目标移除尾部斜杠

- [ ] **Step 2: 运行测试并确认 RED**

  Run: `pnpm exec vitest run src/app/dev-api-proxy.spec.ts`

  Expected: FAIL，原因是 `dev-api-proxy` 模块不存在

- [ ] **Step 3: 实现代理构造函数并接入 Vite**

  在 `src/app/dev-api-proxy.ts` 实现带完整 JSDoc 的 `createDevApiProxy`；在 `vite.config.ts` 使用 `loadEnv` 读取 `VITE_DEV_API_PROXY_TARGET`，把返回值配置到 `server.proxy`

- [ ] **Step 4: 补充环境变量和本地启动文档**

  `.env.example` 增加 `VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8000`；README 说明本地模式保持 `VITE_API_BASE_URL=`，并先启动后端再运行 `pnpm dev`

- [ ] **Step 5: 运行前端聚焦与完整门禁**

  Run: `pnpm exec vitest run src/app/dev-api-proxy.spec.ts`

  Expected: PASS

  Run: `pnpm check`

  Expected: format、ESLint、Stylelint、TypeScript 全部通过

  Run: `pnpm test -- --maxWorkers=1`

  Expected: 全部测试通过

  Run: `pnpm build`

  Expected: 生产构建通过，构建产物不依赖开发代理

- [ ] **Step 6: 提交前端代理**

  ```powershell
  git add -- src/app/dev-api-proxy.ts src/app/dev-api-proxy.spec.ts vite.config.ts .env.example README.md
  git commit -m "feat: 增加管理后台本地API代理"
  ```

### Task 2: 本地管理员初始化核心

**Files:**

- Create: `src/juya_admin_api/local_admin.py`
- Create: `tests/unit/test_local_admin.py`
- Create: `tests/integration/test_local_admin_seed.py`

**Interfaces:**

- Consumes: `JUYA_ENVIRONMENT`、`JUYA_MIGRATION_DATABASE_URL`、`JUYA_LOCAL_ADMIN_USERNAME`、`JUYA_LOCAL_ADMIN_PASSWORD`、`JUYA_LOCAL_ADMIN_TOTP_SECRET`
- Produces: `LocalAdminConfig.from_environment(environ: Mapping[str, str]) -> LocalAdminConfig`
- Produces: `seed_local_admin(config: LocalAdminConfig, repository: LocalAdminRepository, now: datetime) -> SeedResult`
- Produces: `main() -> int`，供容器进程角色调用

- [ ] **Step 1: 写配置与环境限制失败测试**

  测试 `local` 和 `test` 可解析；`production` 在创建 repository 前抛出明确错误；空用户名、密码、TOTP 或数据库地址分别失败；默认值与规范完全一致

- [ ] **Step 2: 运行配置测试并确认 RED**

  Run: `uv run pytest tests/unit/test_local_admin.py -q`

  Expected: FAIL，原因是 `juya_admin_api.local_admin` 不存在

- [ ] **Step 3: 实现配置对象和 repository 协议**

  新增带参数与返回说明的 docstring；定义 `LocalAdminConfig`、`SeedResult`、`LocalAdminRepository`，并在连接数据库前完成环境与输入校验

- [ ] **Step 4: 写首次创建和幂等更新失败测试**

  使用内存 fake repository 断言首次调用返回 `created=True`；已有同名管理员时返回 `created=False`，更新密码哈希、明文测试 TOTP、`ACTIVE` 状态、失败次数、锁定时间和 `last_totp_step`

- [ ] **Step 5: 运行行为测试并确认 RED**

  Run: `uv run pytest tests/unit/test_local_admin.py -q`

  Expected: FAIL，原因是 `seed_local_admin` 尚未完成

- [ ] **Step 6: 实现管理员初始化与 MySQL repository**

  复用 `hash_password` 和 `new_ulid`；使用参数化 SQL 与事务按 username 执行幂等 upsert，不记录密码、密码哈希、TOTP 或数据库密钥

- [ ] **Step 7: 写真实 MySQL 幂等集成测试**

  在 `tests/integration/test_local_admin_seed.py` 使用 `JUYA_TEST_DATABASE_URL`，连续执行两次初始化并断言数据库只有一条同名记录、状态为 `ACTIVE`、锁定字段已清理且新密码可由 Argon2 验证

- [ ] **Step 8: 运行后端聚焦测试**

  Run: `uv run pytest tests/unit/test_local_admin.py -q`

  Expected: PASS

  Run: `uv run pytest tests/integration/test_local_admin_seed.py -q`

  Expected: 未设置隔离 MySQL 时 SKIP；设置后 PASS

- [ ] **Step 9: 提交本地管理员初始化核心**

  ```powershell
  git add -- src/juya_admin_api/local_admin.py tests/unit/test_local_admin.py tests/integration/test_local_admin_seed.py
  git commit -m "feat: 增加本地管理员初始化能力"
  ```

### Task 3: Compose 初始化依赖链

**Files:**

- Modify: `scripts/entrypoint.sh`
- Modify: `scripts/entrypoint.ps1`
- Modify: `docker-compose.dev.yml`
- Modify: `tests/e2e/test_admin_core_flow.py`

**Interfaces:**

- Consumes: Task 2 的 `python -m juya_admin_api.local_admin`
- Produces: `JUYA_PROCESS_ROLE=seed-local-admin`
- Produces: Compose 顺序 `mysql → migrate → seed-local-admin → admin-api`

- [ ] **Step 1: 写 Compose 与入口角色失败测试**

  扩展 `test_admin_core_flow.py`，断言两个 entrypoint 均包含 `seed-local-admin`，Compose 的 seed 服务依赖迁移成功，API 依赖 seed 成功，且 ECS Compose 不包含本地 seed

- [ ] **Step 2: 运行静态编排测试并确认 RED**

  Run: `uv run pytest tests/e2e/test_admin_core_flow.py -q`

  Expected: FAIL，原因是本地 seed 角色和服务不存在

- [ ] **Step 3: 实现 entrypoint 角色**

  Shell 与 PowerShell 入口在 `seed-local-admin` 分支执行 `python -m juya_admin_api.local_admin`，未知角色仍返回 64

- [ ] **Step 4: 实现 Compose 初始化顺序与本地默认值**

  新增一次性 `seed-local-admin` 服务，复用 app env 和迁移数据库地址，设置规范中的三个默认登录变量；`admin-api` 改为依赖 seed 成功

- [ ] **Step 5: 运行聚焦测试与 Compose 配置解析**

  Run: `uv run pytest tests/e2e/test_admin_core_flow.py -q`

  Expected: PASS

  Run: `docker compose -f docker-compose.dev.yml config --quiet`

  Expected: 安装 Docker 后退出码为 0

- [ ] **Step 6: 提交 Compose 初始化链**

  ```powershell
  git add -- scripts/entrypoint.sh scripts/entrypoint.ps1 docker-compose.dev.yml tests/e2e/test_admin_core_flow.py
  git commit -m "feat: 串联本地管理员初始化流程"
  ```

### Task 4: PowerShell 一键启动与故障提示

**Files:**

- Create: `scripts/start-local.ps1`
- Create: `tests/scripts/start-local.Tests.ps1`
- Modify: `README.md`

**Interfaces:**

- Consumes: Docker CLI、Docker Engine、Task 3 的 Compose 服务
- Produces: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1`

- [ ] **Step 1: 写脚本语法与前置检查失败测试**

  `start-local.Tests.ps1` 使用独立 PowerShell 进程验证脚本可解析；通过注入不可用的 Docker 命令验证提示包含“安装并启动 Docker Desktop”且退出码非零；通过占用测试端口验证冲突提示

- [ ] **Step 2: 运行脚本测试并确认 RED**

  Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\scripts\start-local.Tests.ps1`

  Expected: FAIL，原因是启动脚本不存在

- [ ] **Step 3: 实现一键启动脚本**

  脚本依次检查 Docker 命令、Compose 子命令、Engine 和端口，执行 `docker compose -f docker-compose.dev.yml up --build -d`，最多等待 180 秒轮询 `/health/ready`；失败时输出 `docker compose ps` 和 API 日志定位命令并返回非零状态

- [ ] **Step 4: 补充后端本地操作文档**

  README 记录启动、健康检查、默认账号、TOTP 密钥、生成当前 TOTP、停止容器和保留 volume 的行为

- [ ] **Step 5: 运行脚本测试与后端完整门禁**

  Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\scripts\start-local.Tests.ps1`

  Expected: PASS

  Run: `uv run ruff check .`

  Expected: PASS

  Run: `uv run ruff format --check .`

  Expected: PASS

  Run: `uv run mypy src`

  Expected: PASS

  Run: `uv run pytest --cov=juya_admin_api --cov-report=term-missing`

  Expected: 全部非基础设施测试通过，未配置隔离 MySQL 的测试按既有条件 SKIP，覆盖率至少 80%

- [ ] **Step 6: 提交一键启动入口**

  ```powershell
  git add -- scripts/start-local.ps1 tests/scripts/start-local.Tests.ps1 README.md
  git commit -m "feat: 增加管理接口一键本地启动"
  ```

### Task 5: 安装 Docker Desktop

**Files:**

- No repository files

**Interfaces:**

- Consumes: Windows winget、管理员授权、硬件虚拟化
- Produces: 可用的 `docker` 和 `docker compose`

- [ ] **Step 1: 记录安装前状态**

  Run: `docker version`

  Expected: 当前环境 FAIL，证明确实缺少 Docker

- [ ] **Step 2: 安装 Docker Desktop**

  Run: `winget install --exact --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements`

  Expected: 安装成功；若提示启用 WSL 2、虚拟化或重启，则按提示处理并在重启后从 Step 3 继续

- [ ] **Step 3: 启动 Docker Desktop 并等待 Engine**

  从安装路径启动 Docker Desktop；该进程需要用户交互时保持可见，直到托盘状态显示 Engine 已运行

- [ ] **Step 4: 验证 Docker**

  Run: `docker version`

  Expected: Client 与 Server 均返回版本

  Run: `docker compose version`

  Expected: 返回 Compose v2 版本

### Task 6: 真实服务启动与端到端验收

**Files:**

- No new source files

**Interfaces:**

- Consumes: Tasks 1–5 的代理、初始化链、启动脚本和 Docker Engine
- Produces: 后台长期运行的本地容器，以及真实登录验证证据

- [ ] **Step 1: 启动真实后端**

  Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1`

  Working directory: `D:\个人\juya\juya-admin-api`

  Expected: 脚本退出码 0，MySQL、Redis、API、Worker 和 Beat 运行，migrate 与 seed 服务成功退出

- [ ] **Step 2: 验证后端就绪**

  Run: `Invoke-RestMethod http://127.0.0.1:8000/health/ready`

  Expected: HTTP 200，MySQL、schema、Redis、configuration 均为 true

- [ ] **Step 3: 重启或启动前端开发服务器**

  Run: `pnpm dev --host 127.0.0.1`

  Working directory: `D:\个人\juya\juya-admin`

  Expected: `http://127.0.0.1:5173` 可访问且进程保持运行

- [ ] **Step 4: 验证密码阶段经过 Vite 代理**

  向 `http://127.0.0.1:5173/api/v1/admin/session` POST `admin` 与 `JuyaLocal@2026`，断言 HTTP 200、返回 26 位 `challenge_id`，响应不是 Vite 404

- [ ] **Step 5: 验证 TOTP 与受保护请求**

  用 `JBSWY3DPEHPK3PXP` 生成当前 6 位 TOTP，通过前端代理提交 `/session/totp`，保留 Cookie，断言返回 CSRF token；随后请求 `/settings` 并断言 HTTP 200

- [ ] **Step 6: 运行前端真实页面冒烟验收**

  使用 Chromium 打开登录页，输入默认账号、密码和当前 TOTP，断言跳转 `/dashboard`，浏览器网络面板中 session 请求均指向 5173 的 `/api` 同源路径且状态为 200

- [ ] **Step 7: 最终仓库检查**

  Run in each repository: `git status --short --branch`

  Expected: 两个仓库工作树干净，`main` 包含对应中文提交；Docker 容器和前端开发服务保持运行
