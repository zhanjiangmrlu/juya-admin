# 句芽英语管理后台（全量重建）

以工作区 `句芽英语-原型与设计稿/需求基线-20261017.md` 及修订12为需求基线。旧业务源码、契约和部署入口已退出本分支，原实现保留在 Git 历史。统一后端为同级 `juya-api`，管理接口前缀 `/api/admin/v1`。

Node.js22.22+（22系列）、pnpm11.25.0。复制 `.env.example` 配置本地管理 API。使用 `pnpm install`、`pnpm dev` 启动；`pnpm check`、`pnpm test`、`pnpm build` 验证。

后端 `scripts/export-openapi.py` 导出管理端契约后，将 `openapi/admin.json` 更新到本仓库，再运行 `pnpm generate:api`。页面类型直接使用生成契约，不兼容旧接口。

已接通登录、Cookie会话恢复、CSRF、真实上传进度、手动编辑、来源片段、草稿及发布快照、下线删除、只读用户与记录、三项统计。导入、批量发布、排序及云发音将在同一重建分支继续补齐，当前不作为完整交付。

浏览器验证使用单独本地数据库与合成素材，记录见 `docs/verification/core-loop.md`。Playwright端到端源码供用户或CI执行，需通过 `JUYA_E2E_CREDENTIALS_FILE` 指定非生产凭证JSON（username/password），`JUYA_E2E_FIXTURES` 指定测试图片音频目录，启动统一后端后执行 `pnpm test:e2e`。凭证、测试数据和测试结果不得提交。
