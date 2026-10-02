# 本地教学素材收尾记录

2026-10-02 核查《A Better Way to Work》的现有原图、原录音、候选裁剪和真实管理 API。范围为本地开发及自动验收；云权限按用户要求先跳过。六句译文和未确认的时间候选已保存；设备预览触发保存后当前草稿为 v10。正式权属、实际听音及人工逐句标时尚无确认，保留未完成状态。本记录不代表教学内容已经发布。

## 当前草稿证据

场景编号为 `01M3VFQMRKZPHB5A4R7C1T5VHV`，草稿编号为 `01M3VFQMRK4SQKNGZG1KZ1ZEBS`。首次只读 GET 时为 `DRAFT v8`，六句中文、开始、结束和句子音频版本均为空。

- 本轮通过真实保存接口从 v8 更新为 `DRAFT v9`，六句中文、ASR 起止候选和当前句子音频版本已保存；六句仍为 `timing_confirmed=false`。
- 随后实际浏览器设备预览按既有流程先保存，版本递增为 `DRAFT v10`；最新回读确认六句中文和标时候选未变，仍未确认、未发布。见 [sample-final-readback.json](/D:/个人/juya/juya-admin-api/docs/implementation/local-closeout/evidence/sample-final-readback.json)。
- 11 项词条音标齐全，9 项关联稳定来源句，11 项独立音频版本为空。
- `copyright` 和 `source` 为空。原图和整段音频引用已存在；整段音频时长为 24,380 ms，版本为 `01M3VFQMT4VKXJ2BCKACWZPFJQ`。
- 原 WAV 与清单 SHA256 一致；9 段裁剪音频的 SHA256 也全部一致。候选仍为 PCM16、双声道、40,000 Hz。

保存后已回读验证完整内容一致。发布检查当前仅剩 `COPYRIGHT_SOURCE_REQUIRED` 和 `SENTENCE_TIMING_INVALID`，`ready=false`；未调用发布命令。首次保存摘要见 [sample-draft.json](/D:/个人/juya/juya-admin-api/docs/implementation/local-closeout/evidence/sample-draft.json)。后续保存应重新读取草稿和版本，不能固定使用版本 10 覆盖并发修改。

## 已保存的中文译文

译文依据原图和草稿英文逐句起草，保持原有说话人、稳定句子编号、原文及词条引用。最后一句的 `check in` 按工作场景译为“跟进”，没有改成考勤“签到”。

| 稳定句子编号                           | 英文                                                  | 中文                                 |
| -------------------------------------- | ----------------------------------------------------- | ------------------------------------ |
| `89faa283-4b6d-4fde-acb7-d3a629c09427` | How can we solve this scheduling problem?             | 我们该如何解决这个排班问题？         |
| `35ecb799-1ea3-41a3-a23e-40afbe771c0f` | Change the handoff process and improve communication. | 调整交接流程，改善沟通。             |
| `39012081-9850-4634-9b0f-f51a6032e409` | Can you develop a sustainable plan?                   | 你能制定一个可长期执行的计划吗？     |
| `8105f908-4908-4b6a-ba12-99cb0fb418ad` | Yes. Let's start with shorter meetings.               | 可以。我们先从缩短会议时间开始。     |
| `c90ab449-c322-40d2-990a-1a49b3571098` | Who will manage the project?                          | 谁来管理这个项目？                   |
| `45ab04dc-bbe4-4a2a-92f0-13735d419a3c` | Our supervisor. We'll check in every Friday.          | 我们的主管。我们会在每周五跟进进展。 |

保存接口为 `PUT /api/v1/admin/content/revisions/01M3VFQMRK4SQKNGZG1KZ1ZEBS`。`SaveRevisionRequest` 要求完整 `content: SceneContent` 和 `expected_version`，不能只提交六个中文字段。正确操作是先 GET，深复制返回的 `content`，按稳定句子编号仅修改 `chinese`，再构造请求体。以下代码只构造请求体，不执行请求；`revision` 应来自最新 GET：

```python
from copy import deepcopy

translations = {
    "89faa283-4b6d-4fde-acb7-d3a629c09427": "我们该如何解决这个排班问题？",
    "35ecb799-1ea3-41a3-a23e-40afbe771c0f": "调整交接流程，改善沟通。",
    "39012081-9850-4634-9b0f-f51a6032e409": "你能制定一个可长期执行的计划吗？",
    "8105f908-4908-4b6a-ba12-99cb0fb418ad": "可以。我们先从缩短会议时间开始。",
    "c90ab449-c322-40d2-990a-1a49b3571098": "谁来管理这个项目？",
    "45ab04dc-bbe4-4a2a-92f0-13735d419a3c": "我们的主管。我们会在每周五跟进进展。",
}
assert revision["status"] == "DRAFT"
content = deepcopy(revision["content"])
assert {row["id"] for row in content["dialogue"]} == set(translations)
for row in content["dialogue"]:
    row["chinese"] = translations[row["id"]]
payload = {"expected_version": revision["version"], "content": content}
```

`expected_version` 用最新 GET 返回值。中文保存不需要调用词库 PUT，不应改变词条固定版本、整段音频、标时或核对状态。保存后 GET 验证中文、状态、版本及其它字段。冲突返回时重新读取，禁止盲目重放覆盖。

## 元数据草案与权属缺口

原素材路径：

- `D:\个人\图片+音频\图片+音频\A Better Way to Work.png`
- `D:\个人\图片+音频\图片+音频\A Better Way to Work.wav`

原图可见内容没有版权署名或授权声明。PNG 的 `caBX` 块包含 C2PA 元数据字符串：`gpt-image`、版本 `2.0`、`OpenAI Media Service API`、`trainedAlgorithmicMedia`、创建时间 `2026-08-30T00:00:00Z`。这是文件内元数据声明；本次未验证 C2PA 签名，不据此判定权属或录音授权。

可供人工核对的来源描述为：“用户提供的《A Better Way to Work》原图及同名 WAV；图片元数据声明由 gpt-image 2.0 生成。”可以据此完善素材说明，但不能替代版权或音频授权。

版权字段保留空值，直到素材提供者给出图像、英文及录音的权利归属，以及允许用于句芽教学内容的授权说明。不能填入“版权所有”“已授权”等未经证实的结论来通过发布检查。

## 逐句时间候选

以下时间来自既有离线 ASR 的词边界，已保存到 v9 草稿，供播放器核对使用；每句 `audio_version_id` 为当前整段版本 `01M3VFQMT4VKXJ2BCKACWZPFJQ`。没有做人工听音确认，六句均保留 `timing_confirmed=false`。第四句和第六句包含句内停顿，需要完整保留；不能按 ASR 分段截成独立句子。

| 句子顺序 | ASR 开始 ms | ASR 结束 ms |
| -------- | ----------: | ----------: |
| 1        |         360 |        3420 |
| 2        |        4200 |        8430 |
| 3        |        9240 |       12090 |
| 4        |       12990 |       16380 |
| 5        |       17310 |       19440 |
| 6        |       20190 |       24000 |

依据为 `D:\个人\juya\.tools\word-audio\transcript.json`。人工需逐句播放并核对首尾是否完整、留白是否自然，然后使用实际整段音频版本记录起止值并确认。发布守卫要求每句 `0 <= start_ms < end_ms <= 24380`、`audio_version_id` 等于当前整段版本且 `timing_confirmed=true`；只有符合数值约束不代表教学标时已完成。

## 九段候选发音和两项缺音

试听合集为 [audition.wav](/D:/个人/juya/.tools/word-audio/audition.wav)，清单为 [clips.json](/D:/个人/juya/.tools/word-audio/clips.json)。下面顺序与合集一致。

| 顺序 | 词条                  | 文件                                                                                   | 时长 ms | 状态                                                   |
| ---- | --------------------- | -------------------------------------------------------------------------------------- | ------: | ------------------------------------------------------ |
| 1    | change                | [change.wav](/D:/个人/juya/.tools/word-audio/change.wav)                               |     540 | 待实际试听                                             |
| 2    | manage                | [manage.wav](/D:/个人/juya/.tools/word-audio/manage.wav)                               |     570 | 待实际试听                                             |
| 3    | solve                 | [solve.wav](/D:/个人/juya/.tools/word-audio/solve.wav)                                 |     630 | 待实际试听                                             |
| 4    | improve               | [improve.wav](/D:/个人/juya/.tools/word-audio/improve.wav)                             |     570 | 重点核对；独立 ASR 识别为 improved，整句识别为 improve |
| 5    | develop               | [develop.wav](/D:/个人/juya/.tools/word-audio/develop.wav)                             |     690 | 待实际试听                                             |
| 6    | sustainable           | [sustainable.wav](/D:/个人/juya/.tools/word-audio/sustainable.wav)                     |     810 | 待实际试听                                             |
| 7    | scheduling problem    | [scheduling-problem.wav](/D:/个人/juya/.tools/word-audio/scheduling-problem.wav)       |    1350 | 待实际试听                                             |
| 8    | handoff process       | [handoff-process.wav](/D:/个人/juya/.tools/word-audio/handoff-process.wav)             |    1500 | 待实际试听                                             |
| 9    | improve communication | [improve-communication.wav](/D:/个人/juya/.tools/word-audio/improve-communication.wav) |    1590 | 待实际试听                                             |

8 段独立 ASR 与目标文字一致，只能支持文字识别一致，不能证明发音自然、首尾完整或实际输出设备有声。实际试听确认之后，可使用既有 `.tools/repair_sample_word_audio.py --apply-audio --accepted-clips`；该参数表示所有九段确实已经获人类试听确认，不能仅凭自动识别通过就启用。

该脚本依次调用 `/media/upload-policies`、OSS 上传、`/media/uploads/confirm`、`/media/audio-targets`、目标 `/versions`、音频版本 `/commands/confirm`，更新 `/content/lexicon/{entry_id}` 固定版本，然后保存完整草稿并同步 `clickable_spans` 的固定版本。所有管理接口前缀均为 `/api/v1/admin`。正式执行前应核对仍为目标 DRAFT、最新内容和清单哈希。

`coordinate our shifts` 和 `sanction the plan` 出现在原图词条区，但不在原图六句对话及现有录音转写中；清单没有这两段。应补充有授权的独立发音录音，保留空来源句，不能伪造六句内来源或将整句替代词条发音。目前没有找到同素材包内的独立词条录音或权属文档。

## 最小人工信息

后续素材验收只需要补齐以下具体信息：

1. 原图、英文和 WAV 的来源及可用于教学内容的授权说明；若为自制，说明素材提供者和制作方式。
2. 试听合集九段是否完整自然，尤其第 4 段 improve 的边界；提供两项缺音词条的授权录音。
3. 六句在播放器核对后的实际起止时间与确认结果。
4. 在实际 Chrome 和使用的耳机或音箱中，整段录音是否有声。程序播放进度和系统未静音不能替代此反馈。

词条音频属于可选发布素材；未绑定可以通过其对应守卫，但不等于独立发音体验已完成。当前素材收尾与应用代码、自动化验收分别记录。
