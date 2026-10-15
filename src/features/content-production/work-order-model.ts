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

/**
 * 展示快照中的原始值与嵌套记录
 * @param value - 上传时冻结的原始值
 * @returns 保留空值与两侧内容的可读文本
 */
const originalValue = (value: unknown): string => {
  if (value === undefined) return '（原始值未保留）'
  if (value === null) return '（空）'
  if (Array.isArray(value))
    return value.map((row, index) => `第 ${index + 1} 条：\n${originalValue(row)}`).join('\n')
  if (typeof value === 'object')
    return Object.entries(value)
      .map(([key, row]) => `${key}：${originalValue(row)}`)
      .join('\n')
  return String(value)
}
/**
 * 组合读取不可变文档、工作簿与冲突两侧
 * @param snapshot - 原始上传快照
 * @returns 可对照段落及来源位置
 */
export const originalParagraphs = (
  snapshot: Record<string, unknown> | null
): { text: string; locator: string; sourceKey?: string; sourceAliases?: string[] }[] => {
  if (!snapshot) return []
  const result: {
    text: string
    locator: string
    sourceKey?: string
    sourceAliases?: string[]
  }[] = []
  if (Array.isArray(snapshot.documents) && snapshot.documents.length)
    result.push(
      ...snapshot.documents.flatMap((document, index) =>
        originalParagraphs(document as Record<string, unknown>).map((row) => ({
          ...row,
          locator: `文档 ${index + 1} · ${row.locator}`
        }))
      )
    )
  /**
   * 递归遍历解析器原始段落与嵌套表格，单元格文本由子段落完整承载时不重复
   * @param values - 原始块或单元格子块
   * @param prefix - 父级稳定位置
   */
  const appendBlocks = (values: unknown[], prefix = ''): void => {
    values.forEach((value, index) => {
      const row =
        typeof value === 'object' && value ? (value as Record<string, unknown>) : { text: value }
      /**
       * 拼接完整原文位置
       * @param label - 当前块位置
       * @returns 包含父级的稳定位置
       */
      const at = (label: string): string => (prefix ? `${prefix} · ${label}` : label)
      const locator =
        row.kind === 'table_cell'
          ? at(
              `表 ${row.table_index ?? index + 1} · 第 ${row.row_index ?? 1} 行 · 第 ${row.column_index ?? 1} 列`
            )
          : at(`第 ${row.paragraph_index ?? row.index ?? index + 1} 段`)
      if (row.kind === 'table' && Array.isArray(row.rows)) {
        row.rows.forEach((cells, rowIndex) => {
          if (!Array.isArray(cells)) return
          cells.forEach((cell, columnIndex) => {
            const value = cell as Record<string, unknown>
            const cellLocator = at(
              `内嵌表 ${index + 1} · 第 ${rowIndex + 1} 行 · 第 ${columnIndex + 1} 列`
            )
            const first = result.length
            if (Array.isArray(value.children) && value.children.length)
              appendBlocks(value.children, cellLocator)
            else result.push({ text: String(value.text ?? ''), locator: cellLocator })
            if (typeof value.id === 'string' && result[first])
              result[first]!.sourceAliases = [...(result[first]!.sourceAliases || []), value.id]
          })
        })
      } else if (Array.isArray(row.children) && row.children.length) {
        const first = result.length
        appendBlocks(row.children, locator)
        // 表格定位引用父单元格，锚点放在该单元格首个真实段落而不补造原文
        if (typeof row.id === 'string' && result[first])
          result[first]!.sourceAliases = [...(result[first]!.sourceAliases || []), row.id]
      } else
        result.push({
          text: String(row.text ?? row.english ?? ''),
          locator,
          ...(typeof row.id === 'string' ? { sourceKey: row.id } : {})
        })
    })
  }
  const paragraphs = snapshot.blocks ?? snapshot.paragraphs
  if (Array.isArray(paragraphs) && paragraphs.length) appendBlocks(paragraphs)
  if (snapshot.document_path) {
    if (!result.length)
      result.push({ text: '未保留文档正文，请补充源文件后核对', locator: '原文缺失' })
    result.push({ text: String(snapshot.document_path), locator: '源文件' })
  }
  if (snapshot.workbook && typeof snapshot.workbook === 'object') {
    const workbook = snapshot.workbook as Record<string, unknown>
    const rows = Array.isArray(workbook.content_rows)
      ? workbook.content_rows
      : workbook.content_row
        ? [workbook.content_row]
        : []
    for (const section of [
      { label: '原始内容表', rows },
      { label: '原始词条表', rows: Array.isArray(workbook.entry_rows) ? workbook.entry_rows : [] }
    ]) {
      for (const [index, value] of section.rows.entries()) {
        const row = value as Record<string, unknown>
        result.push({
          text: originalValue(row.values ?? row),
          locator: `${section.label} · 第 ${row.row_no ?? index + 1} 行`
        })
        if (Array.isArray(row.cells))
          for (const cell of row.cells as Record<string, unknown>[])
            result.push({
              text: `${cell.heading}：${originalValue(cell.value)}`,
              locator: `${section.label} · 第 ${row.row_no ?? index + 1} 行 · 第 ${cell.column} 列`
            })
      }
    }
  }
  if (snapshot.conflicts && typeof snapshot.conflicts === 'object')
    for (const [field, value] of Object.entries(snapshot.conflicts)) {
      const sides = value as Record<string, unknown>
      for (const [key, label] of [
        ['document', '文档侧'],
        ['workbook', '表格侧']
      ])
        result.push({
          text: originalValue(sides[key!]),
          locator: `原始差异 · ${field} · ${label}`
        })
    }
  if (result.length) return result
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
/**
 * 将候选字段路径映射为精确的可访问编辑标签
 * @param locations - 服务端问题来源与字段路径
 * @returns 对应编辑控件标签
 */
export const issueFieldLabel = (locations: string[]): string => {
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
/**
 * 定位问题的业务修正入口
 * @param target - 服务端修正目标
 * @returns 编辑分区和按钮说明
 */
export const issueAction = (target: string): { section: string; label: string } =>
  ({
    audio: { section: 'audio', label: '试听与调整边界' },
    entries: { section: 'entries', label: '核对本篇词义' },
    source: { section: 'source', label: '对照原文校对' },
    publication: { section: 'publication', label: '检查发布条件' }
  })[target] || { section: 'content', label: '修正正文与译文' }
/**
 * 只选择可重试的发布失败记录
 * @param results - 服务端逐项发布结果
 * @returns 失败版本集合
 */
export const publicationRetryIds = (
  results: ProductionSchema['PublicationItemResult'][]
): string[] => results.filter((row) => row.status === 'FAILED').map((row) => row.revision_id)

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
