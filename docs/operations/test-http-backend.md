# 测试后台 HTTP 接入

`VITE_API_BASE_URL` 保持为空,浏览器以相对路径请求当前站点 `/api/v1/admin/**`。
公网测试站点现有静态目录为 `/opt/juya/juya-admin-web`,Nginx 配置模板见 `deploy/nginx/juya-admin-test.conf`。
前端云效继续构建并上传 `dist/`,发布脚本应保留现有 `/api/` 和 `/health/` 代理;不要安装返回 503 的旧模板。

HTTP 环境缺少 `crypto.randomUUID` 时,请求 ID、幂等键、上传队列和编辑行使用 `crypto.getRandomValues` 生成 UUID。
后端仅在 test 环境开启临时 HTTP Cookie,保留 CSRF 和 HttpOnly。验收必须包含登录、刷新恢复、写操作、退出和下一次前端发布后的代理检查。
备案完成后使用可信 HTTPS 并关闭后端临时开关,重新登录。

小程序客户端不需要放到此 Nginx 目录。执行 `pnpm build:mp-weixin` 后,将 `dist/build/mp-weixin` 导入微信开发者工具,选择对应 AppID,上传开发版本,设置体验版,提审并在通过后发布。
小程序后端仍需独立部署,正式版需配置 HTTPS 合法域名。自动上传可以另行接入官方 `miniprogram-ci`,本次未执行上传或提审。
