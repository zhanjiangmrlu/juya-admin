# 句芽英语管理后台

当前以V1.5整合04增补02、修订17需求与设计为依据，保留原场景并新增主题听读。后台使用 Vue3、TypeScript、SCSS 与 Element Plus，统一后端为同级 `juya-api`，管理接口前缀 `/api/admin/v1`。

**换MacBook继续开发先读[交接入口](HANDOFF.md)**。需求由用户同步，当前Figma链接、三端记录和截图随API仓库提交；四项目沿用Mac已有环境，代码使用`test`分支、数据库使用本地。下方修订14及线上记录是历史，不能作为本次部署授权或当前完整验收结论。

Node.js22.22+（22系列）、pnpm11.25.0。复制 `.env.example` 配置本地管理 API。使用 `pnpm install`、`pnpm dev` 启动；`pnpm check`、`pnpm test`、`pnpm build` 验证。

后端 `scripts/export-openapi.py` 导出管理端契约后，将 `openapi/admin.json` 更新到本仓库，再运行 `pnpm generate:api`。页面类型直接使用生成契约，不兼容旧接口。

已接通登录、Cookie会话恢复、CSRF、真实上传进度、手动编辑、来源片段、草稿及发布快照、下线删除、只读用户与记录、三项统计。保留真实 ZIP／DOCX 导入、批量发布、全局排序、双语标题及音频处理流程。字体和设计图标本地化；图片与音频通过鉴权接口加载。

浏览器验证使用单独本地数据库与合成素材，记录见 `docs/verification/core-loop.md`。Playwright端到端源码供用户或CI执行，需通过 `JUYA_E2E_CREDENTIALS_FILE` 指定非生产凭证JSON（username/password），`JUYA_E2E_FIXTURES` 指定测试图片音频目录，启动统一后端后执行 `pnpm test:e2e`。凭证、测试数据和测试结果不得提交。

修订14的页面截图、80状态映射、验证范围与已知差异见 [界面验收记录](docs/verification/figma-rev14/verification.md)。本地浏览器回归可通过 `JUYA_E2E_BASE_URL` 指定已启动的后台预览，通过 `JUYA_E2E_CHANNEL=chrome` 使用已安装 Chrome；未指定时沿用 Playwright Chromium。导入测试另需 `JUYA_IMPORT_VERIFY_DIR` 指向隔离夹具目录；每次使用新数据库或独立内容的 ZIP，避免被真实去重规则跳过。

外网实时分享已切换到本工作树，使用 `https://dev-admin.juyayingyu.com`，继续使用原本地分享账号和数据。保存本地前端源码后可实时更新，详见 [域名实时访问说明](docs/verification/figma-rev14/local-share.md)。4188隔离预览账号与该域名账号不通用。

修订14后台已部署到 [测试站点](https://test-admin.juyayingyu.com)，实际发布提交、静态资源核对及上线后浏览器验收见 [测试部署记录](docs/verification/figma-rev14/test-deployment-20261019.md)。
