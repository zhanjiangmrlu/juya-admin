export type ProductionStage = 'list' | 'draft' | 'ocr' | 'proofread' | 'audio' | 'publish'
export type EditorStage = Exclude<ProductionStage, 'list' | 'publish'>

export const PRODUCTION_STAGES: readonly { stage: ProductionStage; label: string }[] = [
  { stage: 'list', label: '内容列表' },
  { stage: 'draft', label: '场景草稿' },
  { stage: 'ocr', label: 'OCR候选' },
  { stage: 'proofread', label: '内容校对' },
  { stage: 'audio', label: '音频标时' },
  { stage: 'publish', label: '预览发布' }
]

/**
 * 校验编辑工作区参数，旧编辑链接默认打开内容校对。
 * @param value - 路由查询参数
 * @returns 当前编辑步骤
 */
export function parseEditorStage(value: unknown): EditorStage {
  return value === 'draft' || value === 'ocr' || value === 'audio' ? value : 'proofread'
}
