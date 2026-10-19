# 外网域名实时访问本地后台

2026-10-19已将现有 `https://dev-admin.juyayingyu.com` 本地分享入口切换至本轮修订14后台工作树。沿用已有HTTPS、SSH回环转发、原后台鉴权和本地分享数据，没有修改DNS、云端Nginx或后端业务，也没有重启小程序、H5、API、Worker、调度器、Redis和隧道。只重启后台页面进程。

| 入口                               | 前端代码                                                       | 数据与登录                             |
| ---------------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| `https://dev-admin.juyayingyu.com` | `.worktrees/juya-admin-figma-rev14`，local-share模式，本地4173 | 原有本地分享API8001及原后台账号        |
| `http://127.0.0.1:4188`            | 同一修订14代码，普通开发模式                                   | 隔离验收API18188及合成数据，账号不通用 |

编辑本工作树的Vue／SCSS文件并保存，外网页面通过WSS实时更新。两种开发模式分别缓存依赖，避免影响同时运行的本地隔离预览。外网页面首次需下载本地字体，首次完整字体加载耗时会随本机上传带宽变化；`font-display: swap`允许先显示后替换字体。

当前电脑需保持开机、联网，分享服务保持运行。电脑休眠、关机或隧道断开时，这个域名将无法访问本地服务。

在工作区根目录运行 `./local-share status` 检查；`./local-share start` 复用当前配置并启动未运行服务；`./local-share stop` 会停止整套本地分享服务，包括已有小程序／H5分享。工具私密配置、回退配置和进程归属记录仍位于 `.private/local-share/`，不提交。

## 已验证

- 外网 `/cards/new` 跳转到登录页面，展示修订14字标和登录卡片
- 同源会话接口返回401并带本地实例标记，鉴权仍有效
- 浏览器通过 `wss://dev-admin.juyayingyu.com` 收到Vite connected帧
- 在本地SCSS中追加临时、不影响视觉的CSS属性，外网页面的实际计算样式收到变更；移除后恢复
- 更新及恢复前后 `performance.timeOrigin`不变，证实为热更新，未整页重载
- 临时验证内容完整移除，浏览器无pageerror；全部非web进程PID保持原值
- 外网浏览器用例1/1通过，未跳过；代码检查与原有业务单测另行执行

[外网登录页截图](screenshots/local-share-domain-login.png)。热更新依照[Vite官方服务器与WebSocket配置](https://vite.dev/config/server-options.html#server-ws)，复用现有代理链路，无需放开任意Host或关闭鉴权。

复现浏览器检查：

```sh
JUYA_VERIFY_LOCAL_SHARE=1 JUYA_E2E_CHANNEL=chrome \
JUYA_E2E_BASE_URL=https://dev-admin.juyayingyu.com \
pnpm test:e2e local-share-live.spec.ts
```

此用例临时编辑本工作树 `src/styles/main.scss` 中的独立验证属性，finally只移除该验证块，不覆盖并行输入。只在显式启用时运行。
