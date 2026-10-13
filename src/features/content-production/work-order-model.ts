import type { components } from '@/shared/contracts/generated/admin-api'

export type ProductionSchema = components['schemas']
export type WorkOrder = ProductionSchema['WorkOrder']
export type WorkItem = ProductionSchema['WorkItem']
export type WorkItemDetail = ProductionSchema['WorkItemDetail']
export type CandidateGroup = ProductionSchema['CandidateGroup']
export type CandidateDecision = Omit<ProductionSchema['CandidateDecision'], 'central_action'> & {
  central_action?: ProductionSchema['CandidateDecision']['central_action']
}
export type WorkCandidate = NonNullable<WorkItemDetail['current']>

export const /** 读取不可变文档段落
   * @param snapshot - 原始上传快照
   * @returns 可对照段落及来源位置
   */
  originalParagraphs = (
    snapshot: Record<string, unknown> | null
  ): { text: string; locator: string }[] => {
    if (!snapshot) return []
    if (Array.isArray(snapshot.documents) && snapshot.documents.length)
      return snapshot.documents.flatMap((document, index) =>
        originalParagraphs(document as Record<string, unknown>).map((row) => ({
          ...row,
          locator: `文档 ${index + 1} · ${row.locator}`
        }))
      )
    const paragraphs = snapshot.blocks ?? snapshot.paragraphs
    if (Array.isArray(paragraphs) && paragraphs.length)
      return paragraphs.map((value, index) => {
        const row: Record<string, unknown> =
          typeof value === 'object' && value ? (value as Record<string, unknown>) : { text: value }
        return {
          text: String(row.text ?? row.english ?? ''),
          locator:
            row.kind === 'table_cell'
              ? `表 ${row.table_index} · 第 ${row.row_index} 行 · 第 ${row.column_index} 列`
              : `第 ${row.paragraph_index ?? row.index ?? index + 1} 段`
        }
      })
    if (snapshot.workbook && typeof snapshot.workbook === 'object') {
      const workbook = snapshot.workbook as Record<string, unknown>
      const rows = Array.isArray(workbook.content_rows)
        ? workbook.content_rows
        : workbook.content_row
          ? [workbook.content_row]
          : []
      return rows.map((row, index) => ({
        text: Object.entries(row as Record<string, unknown>)
          .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
          .map(([key, value]) => `${key}：${value}`)
          .join('\n'),
        locator: `原始内容表 · 第 ${index + 1} 行`
      }))
    }
    return Object.entries(snapshot)
      .filter(
        ([key, value]) =>
          typeof value === 'string' &&
          !key.endsWith('_id') &&
          !key.includes('hash') &&
          !key.includes('sha256') &&
          ['text', 'raw_text', 'document_path', 'title_en', 'title_zh'].includes(key)
      )
      .map(([key, value]) => ({
        text: String(value),
        locator:
          (
            {
              text: '原文',
              raw_text: '原文',
              document_path: '源文件',
              title_en: '英文标题',
              title_zh: '中文标题'
            } as Record<string, string>
          )[key] || '原始记录'
      }))
  }
export const /** 将候选字段路径映射为精确的可访问编辑标签
   * @param locations - 服务端问题来源与字段路径
   * @returns 对应编辑控件标签
   */ issueFieldLabel = (locations: string[]): string => {
    const path = locations.join('.')
    const indexed = path.match(
      /(dialogue|vocabulary|chunks)[.[]([0-9]+)[\].]+(english|chinese|speaker|phonetic)/
    )
    if (indexed) {
      const [, section, index, field] = indexed
      const label =
        section === 'dialogue'
          ? (
              { english: '英文句子', chinese: '中文翻译', speaker: '说话人' } as Record<
                string,
                string
              >
            )[field!]
          : `${section === 'chunks' ? 'chunk' : 'vocabulary'} ${({ english: '英文', chinese: '中文', phonetic: '音标' } as Record<string, string>)[field!]}`
      return `${label} ${Number(index) + 1}`
    }
    const labels: Record<string, string> = {
      title_en: '英文标题',
      title_zh: '中文标题',
      translation_zh: '全文中文翻译',
      paragraphs_en: '完整英文',
      safe_intro: '安全简介',
      copyright_source: '来源与版权说明',
      category: '类别',
      topic: '题材',
      level: '难度'
    }
    return Object.entries(labels).find(([field]) => path.includes(field))?.[1] || ''
  }
export const /** 定位问题的业务修正入口
   * @param target - 服务端修正目标
   * @returns 编辑分区和按钮说明
   */
  issueAction = (target: string): { section: string; label: string } =>
    ({
      audio: { section: 'audio', label: '试听与调整边界' },
      entries: { section: 'entries', label: '核对本篇词义' },
      source: { section: 'source', label: '对照原文校对' },
      publication: { section: 'publication', label: '检查发布条件' }
    })[target] || { section: 'content', label: '修正正文与译文' }
export const /** 只选择可重试的发布失败记录
   * @param results - 服务端逐项发布结果
   * @returns 失败版本集合
   */
  publicationRetryIds = (results: ProductionSchema['PublicationItemResult'][]): string[] =>
    results
      .filter((row) => ['FAILED', 'UNKNOWN'].includes(row.status))
      .map((row) => row.revision_id)

export const productionLabels: Record<string, string> = {
  processing: '处理中',
  normal: '正常',
  review_required: '需校对',
  failed: '处理失败',
  confirmed: '已确认',
  publishable: '可发布',
  published: '已发布',
  cancelled: '已取消',
  total: '总篇数',
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  OFFLINE: '已下线',
  QUEUED: '已排队',
  RUNNING: '处理中',
  SUCCEEDED: '已完成',
  SUCCESS: '已完成',
  FAILED: '失败',
  UNKNOWN: '结果待核实',
  PENDING: '待处理',
  READY: '待确认',
  ADOPTED: '已采纳',
  REJECTED: '已拒绝',
  DISMISSED: '已放弃',
  SUPERSEDED: '已有新候选'
}
export const stageLabels: Record<string, string> = {
  VALIDATE: '分篇与中英文配对',
  CONFIRM: '保存导入草稿',
  AUTO_AUDIO: '准备整段音频',
  ASR: '音频对齐',
  SLICE: '生成单句文件',
  AI_LEXICON: '可选词条推荐',
  PROVIDED_LEXICON: '本篇词表与中央释义',
  PUBLISH: '发布合格内容',
  organize: '自动整理',
  sampling: '建立抽样范围',
  'publication-confirm': '发布合格内容',
  'import-confirm': '保存导入草稿'
}
