# 学习笔记PDF后台本地交付

在test分支实现整合07的后台学习笔记PDF与场景ZIP核对。上传传输、异步校验和有效附件分开展示；收到媒体编号即可保存待处理草稿，发布前须就绪或明确取消。失败保留原件，取消更换后忽略迟到绑定；省略/null保留、remove明确移除。附件操作参与原修订号、保存指纹和稳定幂等请求，未知上传响应先恢复操作收据。

单卡候选、批量发布候选、导入候选和已发布效果预览读取各自附件，从管理员会话保护的媒体端点获取PDF Blob；关闭或重试释放URL，后台不调用学习接口。ZIP同包同目录候选使用明确单选或不添加，旧包缺PDF保留原笔记，坏PDF可替换或取消；未保存有效B与失败C通过previous_media_id原子保存，重开并取消仍保留B，原上传键与未知收据状态一起恢复；其他卡片仍可独立保存草稿。场景ZIP帮助已补充选填PDF说明，听读与首页未改。

使用API实际openapi/admin.json生成契约，JSON语义与API源一致。沿用Element Plus、现有主题、进度组件、图标和SCSS嵌套，不新增外部组件库。

## 验证

Node22.23.3；本地完成：

- `pnpm check`
- `pnpm test`：62文件305项通过，保留既有jsdom音频pause提示
- `pnpm build`
- 相关Playwright：6项通过，含5项隔离SQLite/API/worker真实上传发布及ZIP流程，1项受控网络状态边界

真实浏览器命令：

```sh
JUYA_E2E_CHANNEL=chrome \
JUYA_E2E_BASE_URL=http://127.0.0.1:8393 \
JUYA_STUDY_NOTES_FIXTURE=<私有隔离fixture目录> \
pnpm exec playwright test tests/e2e/study-notes.spec.ts tests/e2e/study-notes-live.spec.ts
```

fixture目录需要私有credentials.json（username/password/cardId/versionId/originalNoteId）、有效replacement.pdf、损坏broken.pdf及multiple.zip/broken.zip/legacy.zip。原始卡须已发布并绑定PDF；用API测试辅助创建隔离管理员和合成资料，仅消费media.decode/import.parse/import.save/card.publish/card.action。真实服务、数据库、凭据和截图不提交Git。测试会修改指定fixture卡，禁止指向业务库或业务卡。

真实HTTP/worker/浏览器链已核对：保存新PDF草稿时发布附件不变、候选Blob可打开、发布替换成功、损坏替换保留旧件、发布移除成功，正文version_id始终不变；ZIP三包多候选、坏文件取消和旧包三卡草稿保存成功。另以统一本地验收账号只读查看5173的既有卡，未修改业务数据。

TDD证据、Figma节点、私有运行截图位置和各轮结果见同级API仓库`.superpowers/sdd/2026-11-06-study-notes/task-2-report.md`。首次缺少专用Chromium时改用本机Chrome；私有fixture的ffmpeg路径及Origin白名单已补齐。未运行完整历史e2e、其他浏览器、极限20MB与真实加密PDF的UI逐项验收；后端负责真实格式和加密可读性校验。

本次仅本地实现与验证，未推送、部署、上传OSS或微信，未迁移既有业务数据库。

两轮独立复审已关闭全部前端阻断。最终浏览器合集明确使用Task1b最终内部修复后的隔离API/worker，6/6通过，包含旧ZIP更新已有set(B)/unresolved与未存B→坏C→保存→重开→取消路径。headful Chrome另已目视确认真实PDF正文与1/1页。证据保留在私有fixture的evidence目录；本次临时8392/8393服务验证后关闭，既有5173/8291保持。
