# 句芽英语管理后台

以修订14 `需求基线-当前确认版.md`、原型及 Figma `lf1bnYzDAZt9eLtdLT0HM3 / 191:1617` 为本次界面基线。后台使用 Vue3、TypeScript、SCSS 与 Element Plus，统一后端为同级 `juya-api`，管理接口前缀 `/api/admin/v1`。本轮只修改后台前端，未修改小程序或后端接口。

Node.js22.22+（22系列）、pnpm11.25.0。复制 `.env.example` 配置本地管理 API。使用 `pnpm install`、`pnpm dev` 启动；`pnpm check`、`pnpm test`、`pnpm build` 验证。

后端 `scripts/export-openapi.py` 导出管理端契约后，将 `openapi/admin.json` 更新到本仓库，再运行 `pnpm generate:api`。页面类型直接使用生成契约，不兼容旧接口。

已接通登录、Cookie会话恢复、CSRF、真实上传进度、手动编辑、来源片段、草稿及发布快照、下线删除、只读用户与记录、三项统计。保留真实 ZIP／DOCX 导入、批量发布、全局排序、双语标题及音频处理流程。字体和设计图标本地化；图片与音频通过鉴权接口加载。

浏览器验证使用单独本地数据库与合成素材，记录见 `docs/verification/core-loop.md`。Playwright端到端源码供用户或CI执行，需通过 `JUYA_E2E_CREDENTIALS_FILE` 指定非生产凭证JSON（username/password），`JUYA_E2E_FIXTURES` 指定测试图片音频目录，启动统一后端后执行 `pnpm test:e2e`。凭证、测试数据和测试结果不得提交。

修订14的页面截图、80状态映射、验证范围与已知差异见 [界面验收记录](docs/verification/figma-rev14/verification.md)。本地浏览器回归可通过 `JUYA_E2E_BASE_URL` 指定已启动的后台预览，通过 `JUYA_E2E_CHANNEL=chrome` 使用已安装 Chrome；未指定时沿用 Playwright Chromium。导入测试另需 `JUYA_IMPORT_VERIFY_DIR` 指向隔离夹具目录；每次使用新数据库或独立内容的 ZIP，避免被真实去重规则跳过。
