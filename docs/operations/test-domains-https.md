# 测试子域名 HTTPS 接入

四个测试子域名解析至 ECS `8.163.84.24`。管理后台和管理 API 沿用现有服务。2026-10-12 已接入 H5 静态网站，小程序 API 尚未部署，继续返回明确的 503 未就绪响应。此配置仅声明 `test-` 子域名，生产域名另行接入。

## 域名与服务

| 域名                            | 目标                                                         | 当前行为                                          |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| `test-admin.juyayingyu.com`     | `/opt/juya/juya-admin-web`；保留旧 `/api/` 代理              | 提供管理后台，新前端直接请求独立 API 子域名       |
| `test-admin-api.juyayingyu.com` | `/api/v1/admin/` 与 `/health/ready` 转发至 `127.0.0.1:8000`  | 根路径及其他路径返回 404                          |
| `test-api.juyayingyu.com`       | 等待小程序 API 部署                                          | 返回 503 与 `not_deployed` JSON                   |
| `test-h5.juyayingyu.com`        | `/opt/juya/juya-miniapp-h5`；`/api/` 转发至 `127.0.0.1:8001` | 首页与入口 JavaScript 返回 200；小程序 API 待部署 |

DNS A 记录的解析来源为默认，TTL 为 10 分钟。小程序前端的微信版本发布到微信平台，H5 静态部署不替代微信上传或审核。

## 服务器配置

- 生效的域名配置：`/etc/nginx/conf.d/juya-test-domains.conf`，仓库模板为 `deploy/nginx/juya-test-domains.conf`。
- TLS 片段：`/etc/nginx/snippets/juya-test-tls.conf`，仓库模板为 `deploy/nginx/juya-test-tls.conf`。
- 证书链：`/etc/letsencrypt/live/juya-test/fullchain.pem`。
- 私钥：`/etc/letsencrypt/live/juya-test/privkey.pem`，仅保留在服务器，禁止复制到仓库。
- ACME 验证目录：`/var/www/juya-acme/.well-known/acme-challenge/`。
- 续期配置：`/etc/letsencrypt/renewal/juya-test.conf`。
- 续期后重新加载 Nginx 的钩子：`/etc/letsencrypt/renewal-hooks/deploy/juya-test-nginx-reload`。
- 原配置备份：`/opt/juya/backups/test-domains-20261011/nginx-before/`。
- 原 OSS CORS 规则备份：`/opt/juya/backups/test-domains-20261011/oss-cors-before.json`。

HTTP 仅保留 ACME 验证，其余测试域名请求跳转 HTTPS。未配置的 TLS 域名拒绝握手，不使用测试证书承接其他域名。

后台测试前端使用 `pnpm build:test`，读取 `.env.ecs-test` 中的 `VITE_API_BASE_URL=https://test-admin-api.juyayingyu.com`。接口路径本身包含 `/api/v1/admin/`，环境变量不能再加 `/api`。该变量在构建时写入 JavaScript，修改后需要重新构建和发布。

API 子域名的 Nginx `/api/v1/admin/` 配置仅允许 `https://test-admin.juyayingyu.com` 来源读取响应，支持携带 Cookie、自定义 CSRF/请求 ID/幂等键请求头和 OPTIONS 预检；401 等错误响应同样包含跨域头。其他来源不返回 `Access-Control-Allow-Origin`。前端客户端已使用 `credentials: 'include'`；两个 HTTPS 子域名属于同站点，保留现有 Secure、HttpOnly、SameSite=Strict 和 CSRF 校验，切换后需要在 API 域名下重新登录。

前端流水线只发布静态文件，保留上述域名配置及代理，不以旧 HTTP 模板覆盖它们。旧同源代理仅保留兼容已有页面，新构建产物使用 API 子域名。

2026-10-12 已手动发布 `pnpm build:test` 产物并仅更新服务器管理 API 的跨域配置，保留小程序 API/H5 的现有配置。浏览器从 `/dashboard` 进入时实际请求 `https://test-admin-api.juyayingyu.com/api/v1/admin/session`；新浏览器未登录，401 响应可由前端读取并跳转登录页，无页面脚本错误。允许来源的 OPTIONS 返回 204，其他来源不返回允许来源响应头。同时携带 `Idempotency-Key`、`X-Idempotency-Key`、CSRF 和请求 ID 的未登录 POST 请求也可读取 401，确认这些写请求头不会被预检拦截。未在本次验证中完成真实账号登录、业务写操作或成功退出。

服务器切换前的回滚备份：`/opt/juya/backups/admin-api-domain-20261012.oWDyg5`；补齐幂等请求头前的备份：`/opt/juya/backups/admin-api-domain-headers-20261012.lF089M`；最终前端发布版本：`api-domain-final-20261012-20261012175455-21964`。云效控制台本次无法连接，构建步骤仍需按 [云效测试前端发布](yunxiao-web-deployment.md) 改为 `pnpm build:test`，提交推送后再用于后续自动发布。

完整前端发布脚本为 `deploy/ecs-web-deploy.sh`，随构建制品发布；云效输入框只填写短入口脚本。配置步骤见 [云效测试前端发布](./yunxiao-web-deployment.md)。

现有后台容器使用 `JUYA_ENVIRONMENT=production`，绑定的 OSS Bucket 和预期 Bucket 均为 `juya-test`。本次接入沿用这些配置和 `juya-admin-small` Compose 项目，不重建数据库或修改运行环境字段。`JUYA_ALLOW_INSECURE_HTTP` 未启用，会话 Cookie 保持 HTTPS 要求。

## 首次申请证书

以下命令在 ECS 的 Ubuntu 终端执行。先确认安全组允许来自 `0.0.0.0/0` 的 TCP 80、443，服务器防火墙没有阻止这两个端口。

证书尚未存在时，先将 `deploy/nginx/juya-test-domains-http.conf` 安装为服务器的单个 `juya-test-domains.conf` 文件，提供 ACME HTTP 验证。不要让 HTTP 引导模板和最终 HTTPS 模板同时作为两个生效配置加载。

```bash
sudo install -d -m 755 /var/www/juya-acme/.well-known/acme-challenge
sudo nginx -t
```

检查成功后重新加载 Nginx，验证四个域名的 ACME HTTP 路径可从公网访问，再通过 Ubuntu 官方软件源安装 Certbot 并申请证书：

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends certbot
sudo certbot certonly --webroot -w /var/www/juya-acme \
  --cert-name juya-test \
  -d test-admin.juyayingyu.com \
  -d test-admin-api.juyayingyu.com \
  -d test-api.juyayingyu.com \
  -d test-h5.juyayingyu.com \
  --non-interactive --agree-tos --register-unsafely-without-email
```

申请成功后安装最终 HTTPS 模板和 TLS 片段。先执行 `nginx -t`，成功后再重新加载：

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable --now certbot.timer
```

续期部署钩子使用以下内容并设为可执行：

```sh
#!/bin/sh
set -eu
/usr/sbin/nginx -t
/bin/systemctl reload nginx
```

证书自动续期说明见 [Certbot 官方文档](https://certbot.eff.org/instructions?os=snap&ws=nginx)。

## OSS 上传来源

`juya-test` Bucket 的跨域规则已增加以下精确来源：

```text
https://test-admin.juyayingyu.com
https://test-h5.juyayingyu.com
```

保留原有来源，沿用 GET、POST、HEAD 方法、`content-type` 允许请求头、`ETag` 暴露响应头、300 秒缓存与 `Vary: Origin`。Bucket 保持私有，不使用通配来源。

Bucket 管理者已在 OSS 控制台追加这两个测试来源；配置回读确认原有来源和其他规则字段均保留。现有应用凭据可读取跨域配置，但 `PutBucketCors` 返回 `403 AccessDenied`，后续规则维护仍由 Bucket 管理者执行。步骤见 [阿里云 CORS 配置说明](https://help.aliyun.com/zh/oss/user-guide/configure-cross-origin-resource-sharing)。

## 验收

外网验证必须使用实际域名并保留证书校验，不使用 `-k`：

```bash
curl -I https://test-admin.juyayingyu.com/login
curl -fsS https://test-admin-api.juyayingyu.com/health/ready
curl -I http://test-admin.juyayingyu.com
sudo certbot renew --cert-name juya-test --dry-run --run-deploy-hooks --no-random-sleep-on-renew
```

随后使用真实管理账号验证登录、刷新恢复、保存、OSS 上传和退出。服务器 SSH 账号不能替代应用管理账号。

2026 年 10 月 11 日的服务器及外网验证结果：

- 四个域名的外网证书校验成功；管理后台登录页面与入口 JavaScript 均返回 200。
- 管理 API 健康检查返回 `ready`，MySQL、schema、Redis、configuration 均为 true。
- 后台未登录的 `/api/v1/admin/session` 返回 401；独立管理 API 域名的内部接口路径返回 404。
- 按用户要求将测试管理员密码与本地默认值对齐并清除失败计数，撤销旧会话；公网 HTTP 验证登录返回 200、安全 Cookie 会话恢复返回 200、退出返回 204，退出后会话检查返回 401。验证会话已退出，浏览器页面操作与真实 OSS 上传仍待验收。
- 四个 HTTP 入口返回 301，ACME HTTP 验证路径仍可用。
- 小程序 API 和 H5 返回预期 503，尚不能作为业务可用验收。
- 原 `/etc/nginx/conf.d/juya-private.conf` SHA256 未改变；原有五个容器保持运行。
- Certbot 定时器已启用，续期钩子已安装；安全组放行后，四域名续期演练及 Nginx 重新加载钩子均通过。
- 安全组已放行公网 TCP 443，四个测试域名的外网 HTTPS 已接通；管理 API 健康检查从外网返回 `ready`。
- 测试后台与测试 H5 来源的 OSS GET、POST、HEAD 预检均返回 200，`Access-Control-Allow-Origin` 与请求来源一致；真实账号上传仍待业务验收。

服务器本机的 `--resolve 域名:443:127.0.0.1` 验证只证明 Nginx 和证书正常，不能替代外网访问、真实账号会话、OSS 上传或微信真机验收。

## 后续接入小程序 API 与 H5

部署小程序 API 后，将 `test-api` 的 503 响应替换为实际后端反向代理，并先验证后端就绪。不要将尚未监听的本地开发端口当作已部署服务。

2026-10-12 已将 H5 占位页替换为独立静态目录 `/opt/juya/juya-miniapp-h5`，并执行云效第 2 次运行下载的制品部署。Nginx 修改前备份位于 `/opt/juya/backups/h5-first-deploy-20261012T030146Z/juya-test-domains.conf`。发布脚本校验首页及入口 JavaScript 后输出 `DEPLOY_OK service=juya-miniapp-h5`；公网两个请求均返回 200，后台登录页与后台就绪检查仍返回 200。服务器小程序 API 的 `8001` 端口尚未监听，同域 API 与真实登录不在本次静态发布验收内。

微信小程序构建使用 `VITE_API_BASE_URL=https://test-api.juyayingyu.com`，并在微信公众平台配置实际使用的 HTTPS 服务器域名。
