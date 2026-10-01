# 词卡与真实音频修复（2026-10-01）

执行依据：用户批准的词卡发音、音标与整段音频修复计划。直接在 main 开发，中文提交；只更新样本草稿，不发布、不启用 TTS。

## 任务台账

- [x] 词卡：按参考图排列词条/圆形播放、音标、释义、用法、来源原句；返回原文并恢复焦点；缺失素材明确提示。
- [x] 音频控件：显示唯一播放器的进度/音量控件、失败刷新入口；保留暂停续播和防叠播。
- [x] 样本音标及来源：11 个词条的新固定版本 v2；9 个通过稳定句子编号关联原句；草稿从 v7 保存为 v8。
- [ ] 正式发音素材：9 段候选已截取，待实际试听；通过既有接口上传、确认并绑定固定版本尚未执行。
- [x] 程序验证：RED→GREEN、测试/检查/构建、真实 HTTP/内置浏览器、手机和平板布局。
- [ ] 实际 Chrome 和耳机/音箱听音：问题复现、输出路由验收尚未获得用户反馈，不能声明无声问题已修复。

## 前置证据与裁决

- 两个仓库在 main 且实施前工作区干净，无 AGENTS.md。
- 草稿 `01M3VFQMRK4SQKNGZG1KZ1ZEBS` 实施前 v7，6 词汇/5 语块音标和独立发音均为空。
- 原 WAV：PCM16、双声道、40000Hz、24.38s，RMS -20.15 dBFS；左右同相。浏览器解码就绪、未静音，播放至末尾没有媒体错误。
- 系统默认输出为 Realtek HD Audio 2nd output，100%、未静音；这些检测不能证明用户耳机实际有声。
- Ruling: 复用现有场景/词库/音频接口，不新增公开 API 或数据库表。缺失正式素材列为待补，不生成 TTS、不替换为整句。
- Ruling: 本次 UI 精修沿用后台视觉，参考图用于词卡内容层级；保留固定版本信息，不增加收藏。

## 验证结果

实施与验证跨 2026-10-01 / 2026-10-02，以下结果分别记录，实际听音尚未验收。

### UI 与播放器

- 增加真实组件挂载回归：词卡层级、音标、解释、稳定来源原句、缺失素材禁用、返回原文恢复焦点、签名播放失败后刷新重试。测试先失败再通过。
- 代码复核发现原生控件会保留词条音源：关闭词卡时恢复整段音源，没有整段时清空；关闭处理可重复调用，延迟关闭事件不会停止之后的整段播放。新增失败回归后修复。
- 唯一音频元素负责整段、句子和词条；继续使用既有播放器的并发代次及防叠播机制。
- `pnpm test`：86 文件、294 测试通过；最终变更另运行组件及播放器 9 项测试通过。
- `pnpm check`：Prettier / ESLint / Stylelint / Vue 与 TypeScript 类型检查通过。
- `pnpm build`：通过。
- 两个内容生产 E2E 文件：14 项通过；此前首次执行有一次登录等待超时，单项与整组复跑均通过，未为此修改应用代码。
- 手机预览（外层 1440×900）及平板预览（外层 1280×800）均检查词卡，无内容溢出；平板画框在后台右栏内按可用宽度缩小。截图见 [手机](evidence/word-audio/phone.png)、[平板](evidence/word-audio/tablet.png)。返回按钮后浏览器焦点为原文中的 solve。

### 真实草稿数据

- 使用现有词库 PUT 与草稿保存命令；旧固定版本保留，更新草稿词条引用及所有 clickable_spans 的固定版本。
- 当前草稿 v8，状态仍为 DRAFT；11 个音标、9 个 source_sentence_ids 均已通过真实 GET 验证；整段音频引用保持原值。未调用发布命令。
- 独立发音绑定数仍为 0：候选未经过实际试听，不提前上传或绑定。界面因此继续显示“暂无独立发音，待补充素材”。
- 证据：[草稿变更摘要](evidence/word-audio/draft-v8.json)、[候选截取时间及 SHA256](evidence/word-audio/clips.json)。这些文件不含凭据或签名资源 URL。
- 一次性更新脚本及原始备份在 `D:\个人\juya\.tools`；脚本 `repair_sample_word_audio.py` 对源文件哈希、草稿状态、版本、词条集合进行校验，音频执行需要明确的试听确认参数，尚未执行音频分支。

### 整段音频诊断

- 同一 v8 草稿在 Codex 内置浏览器：readyState=4、muted=false、duration=24.38、error=null；实际暂停于 15.773 秒，继续后为 16.206 秒；自然结束于 24.38 秒，从头重播后为 0.283 秒。
- 播放时 Windows 默认 Realtek HD Audio 2nd output 的 ChatGPT 音频会话 state=1、volume=1、muted=false。此前 Chrome 会话 volume=1、muted=false。这些是系统状态，不代表耳机听音验收。
- 实际 Chrome 的浏览器连接不可用，未能检查其当前标签页静音；没有证据指定 Windows 设置变更。本次未更改系统音量或输出路由。
- 已请用户在实际 Chrome 刷新同一预览页并反馈是否有声；该反馈尚未收到。

### 待试听及待补素材

候选文件保留原录音的 PCM16 双声道、40000Hz，仅裁剪原始采样，未合成音频。顺序如下，合集位于 `D:\个人\juya\.tools\word-audio\audition.wav`。

1. change
2. manage
3. solve
4. improve
5. develop
6. sustainable
7. scheduling problem
8. handoff process
9. improve communication

本地离线 ASR 独立识别 8 段完全匹配；第 4 段 improve 独立识别为 improved，而整句识别为 improve，需要重点试听边界。ASR 不代替人工听音，不证明截词自然完整。

原录音未出现 `coordinate our shifts`、`sanction the plan`，这两项需补充正式素材，也未伪造来源原句。当前所有 11 项独立发音仍未绑定，其中 9 项待试听、2 项待补素材。

### 音标来源

采用美式音标；单词参考 Cambridge 发音页：[change](https://dictionary.cambridge.org/pronunciation/english/change)、[manage](https://dictionary.cambridge.org/us/pronunciation/english/manage)、[solve](https://dictionary.cambridge.org/us/pronunciation/english/solve)、[improve](https://dictionary.cambridge.org/us/pronunciation/english/improve)、[develop](https://dictionary.cambridge.org/us/pronunciation/english/develop)、[sustainable](https://dictionary.cambridge.org/us/pronunciation/english/sustainable)。

语块音标按组成词拼写复数、进行时后组合：[schedule](https://dictionary.cambridge.org/us/pronunciation/english/schedule)、[problem](https://dictionary.cambridge.org/pronunciation/english/problem)、[handoff](https://dictionary.cambridge.org/pronunciation/english/handoff)、[process](https://dictionary.cambridge.org/pronunciation/english/process)、[communication](https://dictionary.cambridge.org/us/pronunciation/english/communication)、[coordinate](https://dictionary.cambridge.org/pronunciation/english/coordinate)、[our](https://dictionary.cambridge.org/us/pronunciation/english/our)、[shift](https://dictionary.cambridge.org/us/pronunciation/english/shift)、[sanction](https://dictionary.cambridge.org/us/pronunciation/english/sanction)、[plan](https://dictionary.cambridge.org/us/pronunciation/english/plan)。语块组合不是词典整段录音的转写。

### 访问与继续验收

[本地预览](http://127.0.0.1:5173/content/scenes/01M3VFQMRK4SQKNGZG1KZ1ZEBS/publish)。API 就绪地址为 `http://127.0.0.1:8000/health/ready`。

收到试听结果后才能完成正式素材上传/确认/绑定以及真实词条音源切换验证；收到实际 Chrome 听音结果后才能完成无声问题验收。本次仅更新草稿，未发布教学内容。
