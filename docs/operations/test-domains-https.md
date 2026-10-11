# 测试子域名 HTTPS 接入

四个测试子域名解析至 ECS `8.163.84.24`。管理后台和管理 API 沿用现有服务，小程序 API 和 H5 在部署前返回明确的 503 未就绪响应。此配置仅声明 `test-` 子域名，生产域名另行接入。

## 域名与服务

| 域名                            | 目标                                                        | 当前行为                        |
| ------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| `test-admin.juyayingyu.com`     | `/opt/juya/juya-admin-web`；`/api/` 转发至 `127.0.0.1:8000` | 提供管理后台与同源接口          |
| `test-admin-api.juyayingyu.com` | `/api/v1/admin/` 与 `/health/ready` 转发至 `127.0.0.1:8000` | 根路径及其他路径返回 404        |
| `test-api.juyayingyu.com`       | 等待小程序 API 部署                                         | 返回 503 与 `not_deployed` JSON |
| `test-h5.juyayingyu.com`        | 等待 H5 部署                                                | 返回 503 与中文未部署页面       |

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

后台前端继续使用空的 `VITE_API_BASE_URL`，由 `/api/` 同源代理访问管理接口。前端流水线只发布静态文件，保留上述域名配置及代理，不以旧 HTTP 模板覆盖它们。

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

`juya-test` Bucket 的跨域规则需增加精确来源：

```text
https://test-admin.juyayingyu.com
```

保留原有来源，沿用 GET、POST、HEAD 方法、`content-type` 允许请求头、`ETag` 暴露响应头、300 秒缓存与 `Vary: Origin`。Bucket 保持私有，不使用通配来源。

现有应用凭据可读取跨域配置，但 `PutBucketCors` 返回 `403 AccessDenied`，需要 Bucket 管理者在 OSS 控制台追加来源。步骤见 [阿里云 CORS 配置说明](https://help.aliyun.com/zh/oss/user-guide/configure-cross-origin-resource-sharing)。

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
- 四个 HTTP 入口返回 301，ACME HTTP 验证路径仍可用。
- 小程序 API 和 H5 返回预期 503，尚不能作为业务可用验收。
- 原 `/etc/nginx/conf.d/juya-private.conf` SHA256 未改变；原有五个容器保持运行。
- Certbot 定时器已启用，续期钩子已安装；安全组放行后，四域名续期演练及 Nginx 重新加载钩子均通过。
- 安全组已放行公网 TCP 443，四个测试域名的外网 HTTPS 已接通；管理 API 健康检查从外网返回 `ready`。
- 新后台来源的 OSS POST 预检返回 403，待管理员追加 CORS 来源。

服务器本机的 `--resolve 域名:443:127.0.0.1` 验证只证明 Nginx 和证书正常，不能替代外网访问、真实账号会话、OSS 上传或微信真机验收。

## 后续接入小程序 API 与 H5

部署小程序 API 后，将 `test-api` 的 503 响应替换为实际后端反向代理，并先验证后端就绪。不要将尚未监听的本地开发端口当作已部署服务。

发布 H5 时配置独立静态目录与同源 `/api/` 代理，再替换 `test-h5` 的 503 页面。微信小程序构建使用 `VITE_API_BASE_URL=https://test-api.juyayingyu.com`，并在微信公众平台配置实际使用的 HTTPS 服务器域名。
