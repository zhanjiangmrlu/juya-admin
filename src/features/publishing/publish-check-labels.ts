const checkLabels: Readonly<Record<string, string>> = {
  TITLE_REQUIRED: '请填写英文标题和中文标题',
  ORIGINAL_IMAGE_REQUIRED: '请上传并确认学习原图',
  DIALOGUE_REQUIRED: '请添加对话，并填写说话人、英文和中文',
  VOCABULARY_REQUIRED: '请添加词汇，并填写英文和中文',
  CHUNKS_REQUIRED: '请添加短语，并填写英文和中文',
  COPYRIGHT_SOURCE_REQUIRED: '请填写版权说明和内容来源',
  AUDIO_MISSING: '请上传并确认整段音频',
  PROOFREADING_CONFIRMATION_REQUIRED: '请进入正常内容抽样，核对样本并完成候选集合确认后重新检查',
  SENTENCE_SLICE_INVALID:
    '请进入音频对齐与切片，刷新逐句状态；修正异常边界并重生成实际单句文件后重新检查',
  CHUNK_IMAGE_INVALID:
    '请进入结构化编辑，检查语块图片的绑定版本与素材审核状态，重新上传或确认后保存',
  SENTENCE_TIMING_INVALID: '请设置并确认每句对话在整段音频中的起止时间',
  ENTRY_AUDIO_INVALID: '请确认词汇或短语绑定的音频版本',
  ENTRY_REFERENCE_INVALID: '词汇或短语引用的词条版本无效，请重新选择或保存',
  SOURCE_REFERENCE_INVALID: '请修正词汇或短语引用的来源句子',
  COVER_INVALID: '请使用已确认的独立封面图，封面不能与学习原图相同',
  ICONS_INVALID: '请上传并确认词汇或短语图标'
}

/**
 * 将发布检查码转换为可操作的中文说明，未知检查码保留原文
 * @param code - 服务端返回的发布检查码
 * @returns 检查项目说明
 */
export const publishCheckLabel = (code: string): string => {
  return Object.hasOwn(checkLabels, code) ? checkLabels[code]! : code
}
