export type ProductionStage =
  'list' | 'draft' | 'proofread' | 'entries' | 'candidates' | 'audio' | 'publish'
export type EditorStage = Exclude<ProductionStage, 'list' | 'publish'>

export const PRODUCTION_STAGES: readonly { stage: ProductionStage; label: string }[] = [
  { stage: 'list', label: '内容列表' },
  { stage: 'draft', label: '场景结构化编辑' },
  { stage: 'proofread', label: '正文对照与配对校对' },
  { stage: 'entries', label: '本篇词汇与语块' },
  { stage: 'candidates', label: '中央词库候选' },
  { stage: 'audio', label: '场景音频对齐与切片' },
  { stage: 'publish', label: '预览与发布检查' }
]

/**
 * 校验编辑工作区参数，旧编辑链接默认打开正文对照与配对校对
 * @param value - 路由查询参数
 * @returns 当前编辑步骤
 */
export const parseEditorStage = (value: unknown): EditorStage =>
  value === 'draft' || value === 'audio' || value === 'entries' || value === 'candidates'
    ? value
    : 'proofread'
