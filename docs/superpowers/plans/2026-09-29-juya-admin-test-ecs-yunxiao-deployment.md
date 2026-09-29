# juya-admin 测试环境云效 ECS 部署实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 GitHub `test` 分支构建 `juya-admin`，通过云效 Flow 将静态制品安全发布到测试 ECS `8.163.84.24`，并能通过 `http://8.163.84.24` 访问。

**Architecture:** GitHub 是唯一代码源；测试 Flow 对 `CI_COMMIT_REF_NAME=test` 做硬校验，在云效公共构建机完成 Node/pnpm 质量门禁和 Vite 构建，再通过 ArtifactUpload 与 VMDeploy 将 `dist`、Nginx 配置和发布脚本送到独立测试主机组。ECS 使用 `/opt/juya-admin/test/releases/<release-id>`、`current` 符号链接和 Nginx 实现原子切换，健康检查失败时恢复上一链接。

**Tech Stack:** GitHub、阿里云云效 Flow YAML、Node.js 22.22.x、pnpm 11.22.0、Vue 3、Vite 8、Node.js Test Runner、POSIX shell、Nginx、阿里云 ECS

**Spec:** `docs/superpowers/specs/2026-09-29-juya-admin-ecs-yunxiao-deployment-design.md`

## Global Constraints

- GitHub 仓库 `zhanjiangmrlu/juya-admin` 是唯一代码源，不迁移或镜像到云效 Codeup。
- `test` 分支只能构建和部署测试环境；`main` 分支只保留为未来生产构建来源。
- 本次只创建、配置和运行测试环境发布链路，不配置、不访问、不执行任何生产发布目标。
- 测试 ECS 固定为 `8.163.84.24`，测试发布根目录固定为 `/opt/juya-admin/test`。
- Node.js 使用 22.22.x，pnpm 使用 11.22.0，安装依赖必须使用锁文件。
- 本次不部署 `juya-admin-api`；Nginx 对 `/api/` 返回 503。
- 不在仓库、制品或日志中保存 GitHub、云效、ECS 或 SSH 凭据。
- 公网 HTTP 仅用于本阶段静态页面验收；正式登录前必须另行配置域名和 HTTPS。

## Review Focus

- 手动选择 `main` 或任意非 `test` 分支运行测试 Flow 时，必须在构建开始前失败，且不能进入 VMDeploy。
- 环境参数与分支交叉组合（如 `production test`、`test main`）时，发布脚本必须失败且不修改任何 `current` 链接。
- 发布 ID 包含 `/`、`..`、空白或 shell 元字符时，必须拒绝，避免写出测试发布根目录。
- 新版本首页健康检查失败时，必须恢复原版本链接并再次重载 Nginx；首次发布失败则移除无效链接。
- 目标机缺少 Nginx、制品缺少 `dist/index.html` 或 `/assets` 时，发布必须失败并保留旧版本。

---

## 文件结构

- `deploy/environment.sh`：唯一维护 `test/test` 与 `production/main` 分支环境映射及发布根目录。
- `deploy/ecs-deploy.sh`：校验制品、创建版本、安装测试站点配置、原子切换、健康检查、回滚和版本清理。
- `deploy/nginx/juya-admin-test.conf`：测试站点、History 路由、缓存、安全头和 `/api` 503 行为。
- `tests/deployment/helpers.mjs`：跨 Windows Git Bash 与 Linux bash 的脚本执行和临时夹具工具。
- `tests/deployment/environment.test.mjs`：环境映射与非法输入回归测试。
- `tests/deployment/nginx-config.test.mjs`：Nginx 测试站点静态契约测试。
- `tests/deployment/ecs-deploy.test.mjs`：成功发布、非法制品与自动回滚黑盒测试。
- `tests/deployment/pipeline-config.test.mjs`：云效分支门禁、工具版本、制品和测试主机组契约测试。
- `.aliyun-ci.yml`：仅测试环境的云效 Flow 流水线定义。
- `package.json`：将 Node 部署测试加入现有 `pnpm test`。
- `README.md`：记录 GitHub 分支映射、云效变量、ECS 前置条件、发布和验收方式。

### Task 1: 环境与分支硬隔离

**Files:**

- Create: `deploy/environment.sh`
- Create: `tests/deployment/helpers.mjs`
- Create: `tests/deployment/environment.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: CLI 参数 `<environment> <branch>`。
- Produces: `resolve_deploy_root(environment, branch)`；合法组合 `test/test` 输出 `/opt/juya-admin/test`，`production/main` 输出 `/opt/juya-admin/production`，其他组合返回非零。
- Produces: `runBash(scriptPath, args, options) -> Promise<{ code, stdout, stderr }>`，供后续部署测试复用。

- [ ] **Step 1: 为合法和非法映射编写失败测试**

在 `tests/deployment/environment.test.mjs` 增加以下用例：`test/test`、`production/main` 返回固定根目录；`test/main`、`production/test`、未知环境、缺失参数均返回非零且没有根目录输出。

- [ ] **Step 2: 将部署测试接入测试命令并确认红灯**

在 `package.json` 增加 `test:deploy: node --test tests/deployment/*.test.mjs`，将 `test` 改为 `vitest run && pnpm test:deploy`。

Run: `pnpm test:deploy`
Expected: FAIL，因为 `deploy/environment.sh` 尚不存在。

- [ ] **Step 3: 实现 `resolve_deploy_root()`**

在 `deploy/environment.sh` 定义可 source 的 `resolve_deploy_root()`，并在脚本直接执行时读取两个 CLI 参数。只允许精确的 `test/test` 和 `production/main` 映射，不读取外部可变根目录覆盖值。

- [ ] **Step 4: 运行映射测试和现有测试**

Run: `pnpm test:deploy && pnpm test`
Expected: 所有测试 PASS，输出中包含固定的两个合法发布根目录。

- [ ] **Step 5: 提交环境隔离**

```bash
git add package.json deploy/environment.sh tests/deployment/helpers.mjs tests/deployment/environment.test.mjs
git commit -m "feat: 增加部署环境分支隔离"
```

### Task 2: Nginx 测试站点契约

**Files:**

- Create: `deploy/nginx/juya-admin-test.conf`
- Create: `tests/deployment/nginx-config.test.mjs`

**Interfaces:**

- Consumes: 测试发布链接 `/opt/juya-admin/test/current`。
- Produces: 监听 80 的默认测试站点；`/` 支持 History 回退，`/assets/` 长缓存，`index.html` 不缓存，`/api/` 返回 503。

- [ ] **Step 1: 编写 Nginx 配置失败测试**

测试必须断言 `listen 80 default_server`、固定测试 root、`try_files $uri $uri/ /index.html`、`location ^~ /api/` 与 `return 503`、`index.html` no-store、`assets` immutable、安全响应头以及隐藏文件拒绝规则。

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm test:deploy`
Expected: FAIL，因为 `deploy/nginx/juya-admin-test.conf` 尚不存在。

- [ ] **Step 3: 创建最小测试站点配置**

配置只包含测试环境行为，不添加域名、TLS、API 代理或生产 server block。使用 `server_name _` 接受公网 IP Host。

- [ ] **Step 4: 运行配置契约测试**

Run: `pnpm test:deploy`
Expected: PASS，且现有环境映射测试仍通过。

- [ ] **Step 5: 提交测试站点配置**

```bash
git add deploy/nginx/juya-admin-test.conf tests/deployment/nginx-config.test.mjs
git commit -m "feat: 增加测试环境 Nginx 站点"
```

### Task 3: 原子发布与自动回滚脚本

**Files:**

- Create: `deploy/ecs-deploy.sh`
- Create: `tests/deployment/ecs-deploy.test.mjs`

**Interfaces:**

- Consumes: `ecs-deploy.sh <environment> <branch> <release-id> <bundle-dir>`；bundle 必须包含 `dist/index.html`、`dist/assets/` 和 `deploy/nginx/juya-admin-test.conf`。
- Consumes: `JUYA_DEPLOY_TEST_MODE=1` 与 `JUYA_DEPLOY_TEST_ROOT=<temp-dir>` 仅供自动化测试把绝对系统路径映射到临时目录；未同时满足这两个条件时禁止路径覆盖，环境/分支映射仍由 `environment.sh` 固定验证。
- Produces: `<deploy-root>/releases/<release-id>`、`<deploy-root>/current` 和测试 Nginx 站点配置；成功只保留当前与上一版本。

- [ ] **Step 1: 编写成功发布与输入校验失败测试**

使用临时 bundle、`JUYA_DEPLOY_TEST_MODE=1`、临时路径前缀和 PATH 中的假 `nginx`/`curl`，断言首次成功发布创建版本和 `current`；缺少首页、缺少 assets、非法发布 ID、错误分支组合均返回非零且不创建或切换链接。另加一例断言未开启测试模式时设置测试路径前缀会被拒绝。

- [ ] **Step 2: 编写回滚失败测试**

先发布版本 A，再让假 `curl` 对版本 B 返回失败；断言脚本返回非零、`current` 恢复 A、Nginx 发生第二次 reload。首次发布健康检查失败时断言 `current` 不存在。

- [ ] **Step 3: 运行测试确认红灯**

Run: `pnpm test:deploy`
Expected: FAIL，因为 `deploy/ecs-deploy.sh` 尚不存在。

- [ ] **Step 4: 实现 `ecs-deploy.sh`**

脚本使用 `set -eu`，source `environment.sh`；发布 ID只允许 `[A-Za-z0-9._-]+` 且拒绝 `.`、`..`；复制到新版本目录后以临时链接加 `mv -Tf` 原子切换；依次执行 `nginx -t`、`nginx -s reload`、`curl --fail --silent --show-error http://127.0.0.1/`。任一步失败都恢复旧链接；成功后按修改时间只保留两个版本。

- [ ] **Step 5: 运行部署黑盒测试**

Run: `pnpm test:deploy`
Expected: 所有成功、拒绝和回滚用例 PASS。

- [ ] **Step 6: 提交发布脚本**

```bash
git add deploy/ecs-deploy.sh tests/deployment/ecs-deploy.test.mjs
git commit -m "feat: 实现 ECS 原子发布与回滚"
```

### Task 4: 云效测试 Flow 与运维文档

**Files:**

- Create: `.aliyun-ci.yml`
- Create: `tests/deployment/pipeline-config.test.mjs`
- Modify: `README.md`

**Interfaces:**

- Consumes: 云效内置变量 `CI_COMMIT_REF_NAME`、`CI_COMMIT_SHA`、`BUILD_NUMBER` 与测试变量 `ECS_TEST_MACHINE_GROUP_ID`。
- Produces: `juya_admin_test_web` 公共制品，包含 `dist/` 与 `deploy/`；VMDeploy 下载到 `/tmp/juya-admin-test.tgz` 并调用 `ecs-deploy.sh test test "${BUILD_NUMBER}-${CI_COMMIT_SHA}" <staging-dir>`。

- [ ] **Step 1: 编写流水线静态失败测试**

断言 `.aliyun-ci.yml` 使用 Node `22.22` 容器、激活 pnpm `11.22.0`、首个命令校验 `CI_COMMIT_REF_NAME=test`、运行 `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm test`、`pnpm build`、上传 `dist/` 与 `deploy/`、VMDeploy 只引用 `ECS_TEST_MACHINE_GROUP_ID`，且不出现生产主机组或生产审批变量。

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm test:deploy`
Expected: FAIL，因为 `.aliyun-ci.yml` 尚不存在。

- [ ] **Step 3: 创建测试 Flow YAML**

质量与构建任务使用云效 `public/cn-hangzhou` 构建池和 `node:22.22.0-bookworm-slim` 容器。构建任务上传公共制品；部署任务使用 `VMDeploy`、测试主机组变量和 `root` 执行用户，并在 ECS 侧再次传入 `test/test` 做双重校验。

- [ ] **Step 4: 更新 README**

记录 GitHub `test → 测试`、`main → 生产` 映射，本次只有测试 Flow；列出云效 GitHub 服务连接、`ECS_TEST_MACHINE_GROUP_ID`、主机组、TCP 80 安全组、Nginx 与最小权限前置条件；注明后端未部署时 `/api` 返回 503。

- [ ] **Step 5: 运行部署测试与项目质量门禁**

Run: `pnpm test:deploy && pnpm check && pnpm test && pnpm build`
Expected: 全部 PASS，`dist/index.html` 与 `dist/assets/` 存在。

- [ ] **Step 6: 提交流水线与文档**

```bash
git add .aliyun-ci.yml tests/deployment/pipeline-config.test.mjs README.md
git commit -m "feat: 增加云效测试环境流水线"
```

### Task 5: 建立并发布 GitHub test 分支

**Files:**

- Modify: Git refs only

**Interfaces:**

- Consumes: 通过全部验证的当前提交。
- Produces: 本地与远程 `test` 分支，远程引用为 `origin/test`；不修改 `origin/main`。

- [ ] **Step 1: 检查提交和工作树**

Run: `git status --short && git log --oneline --decorate -8 && git branch -a --no-color`
Expected: 工作树干净，部署任务提交全部位于当前基线，远程尚无 `origin/test`。

- [ ] **Step 2: 创建本地 test 分支**

Run: `git switch -c test`
Expected: 当前分支为 `test`，提交 SHA 与切换前一致。

- [ ] **Step 3: 执行分支发布前验证**

Run: `pnpm check && pnpm test && pnpm build`
Expected: 全部 PASS。

- [ ] **Step 4: 只推送 test 分支**

Run: `git push -u origin test`
Expected: GitHub 创建 `test` 分支并设置 `origin/test` 上游；`origin/main` SHA 不变。

### Task 6: 配置云效测试资源并完成首次发布

**Files:**

- Modify: 云效 Flow、GitHub Webhook/服务连接、云效测试主机组与 ECS 测试机运行状态

**Interfaces:**

- Consumes: GitHub `zhanjiangmrlu/juya-admin@test`、`.aliyun-ci.yml`、ECS `8.163.84.24`。
- Produces: 只允许 `test` 分支触发的测试 Flow、只包含该 ECS 的测试主机组，以及公网可访问的测试站点。

- [ ] **Step 1: 在云效核实现有连接与资源**

只读检查 GitHub 服务连接、流水线列表、测试主机组、ECS 操作系统、Nginx 状态和 TCP 80 安全组状态。若需要新建 GitHub 授权、主机组权限或安装 Runner/Nginx，在发生权限授予或软件安装前按电脑操作确认策略暂停并请求确认。

- [ ] **Step 2: 创建或绑定测试主机组**

主机组名称使用 `juya-admin-test`，只加入 `8.163.84.24`，不加入任何生产主机。验证云效显示主机在线可用。

- [ ] **Step 3: 准备 ECS 测试站点前置条件**

确认 Nginx 已安装并运行；确认 `/opt/juya-admin/test` 可由部署用户写入；确认安全组 TCP 80 已放通。不得开放 8000，不得配置生产目录或生产域名。

- [ ] **Step 4: 创建测试 Flow**

代码源选择 GitHub `zhanjiangmrlu/juya-admin`，默认分支与提交触发过滤器均设为精确 `test`；流程读取仓库 `.aliyun-ci.yml`；变量 `ECS_TEST_MACHINE_GROUP_ID` 绑定测试主机组。手动运行界面也保留分支选择，但脚本门禁拒绝非 `test`。

- [ ] **Step 5: 运行首次测试发布**

从 `test` 分支启动 Flow，观察质量、构建、制品上传和 VMDeploy 全部成功。若任一阶段失败，只修复测试链路并从失败证据重新验证，不切换到 `main` 或生产资源。

- [ ] **Step 6: 验证公网与路由行为**

Run: `Invoke-WebRequest http://8.163.84.24/ -TimeoutSec 15`、`Invoke-WebRequest http://8.163.84.24/login -TimeoutSec 15`、`Invoke-WebRequest http://8.163.84.24/api/ -SkipHttpErrorCheck -TimeoutSec 15`

Expected: `/` 与 `/login` 返回 200 且页面标题为句芽管理后台；静态资源返回 200；`/api/` 返回 503。

- [ ] **Step 7: 验证环境隔离与回滚记录**

确认 Flow 运行详情的分支为 `test`、目标主机组为 `juya-admin-test`、发布目录为 `/opt/juya-admin/test`；确认未创建或运行生产 Flow。记录首次成功的 Flow 运行 ID、Git SHA、访问地址和版本目录。

### Task 7: 最终证据与交付

**Files:**

- Modify: none unless验证发现文档与实际配置偏差

**Interfaces:**

- Consumes: 测试 Flow 成功记录、GitHub `origin/test`、公网健康检查结果。
- Produces: 可复核的部署交付摘要。

- [ ] **Step 1: 重新执行本地完整门禁**

Run: `pnpm check && pnpm test && pnpm build`
Expected: 全部 PASS。

- [ ] **Step 2: 核对 Git 与环境边界**

Run: `git status --short && git branch -vv && git log -5 --oneline --decorate`
Expected: 工作树干净，当前 `test` 跟踪 `origin/test`；没有推送或部署 `main` 的新生产配置动作。

- [ ] **Step 3: 交付验证摘要**

报告测试访问地址、GitHub 分支与 SHA、云效 Flow 名称与运行结果、ECS 版本目录、三类 HTTP 验证结果以及后端未部署的限制。若任何验证未通过，不声明部署完成，并明确保留的上一可用状态。
