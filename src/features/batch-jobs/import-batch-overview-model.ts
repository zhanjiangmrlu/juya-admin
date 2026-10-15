import type { ApiClient } from '@/services/api/api-client'

type Row = Record<string, unknown>
export interface ImportBatchProblem {
  itemId: string
  title: string
  location: string
  message: string
  failed: boolean
  destination: string
}
export interface ImportBatchOverview {
  id: string
  status: string
  counts: Record<
    | 'total'
    | 'processing'
    | 'normal'
    | 'proofreading'
    | 'failed'
    | 'confirmed'
    | 'publishable'
    | 'published'
    | 'cancelled',
    number | null
  >
  problems: ImportBatchProblem[]
  usage: Row | null
}
/**
 * 读取接口对象，拒绝把数组作为字段结构
 * @param value - 接口返回的未知对象
 * @returns 当前操作结果或完成状态
 */
const record = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}
/**
 * 映射持久化导入结果，草稿创建成功不能当作已发布
 * @param raw - 当前真实批次的预览响应
 * @returns 当前操作结果或完成状态
 */
export const mapImportBatchOverview = (raw: Row): ImportBatchOverview => {
  const items = Array.isArray(raw.items) ? raw.items.map(record) : null
  const problems: ImportBatchProblem[] = []
  let normal = 0,
    proofreading = 0,
    failed = 0,
    processing = 0,
    published = 0,
    cancelled = 0
  for (const item of items ?? []) {
    const candidate = record(item.candidate),
      result = record(item.result)
    const title = String(
      candidate.title_zh || candidate.title_en || item.import_content_id || '待解析篇目'
    )
    const issues = (Array.isArray(item.issues) ? item.issues : [])
      .map(record)
      .filter((issue) => ['ERROR', 'CONFIRM', 'WARNING'].includes(String(issue.severity)))
    const isFailed = item.status === 'FAILED'
    if (isFailed) failed++
    else if (issues.length) proofreading++
    else if (['PENDING', 'READY', 'SUCCESS', 'SKIPPED'].includes(String(item.status))) normal++
    if (['PROCESSING', 'RUNNING'].includes(String(item.status))) processing++
    if (item.status === 'CANCELLED' || item.status === 'EXCLUDED') cancelled++
    if (item.status === 'PUBLISHED' || result.publication_status === 'PUBLISHED') published++
    const contentId = String(result.content_id || record(item.mapping).content_id || '')
    const type = String(candidate.content_type || record(raw.manifest).content_type || 'dialogue')
    const destination = contentId
      ? type === 'short_reading'
        ? `/content/short-readings/${encodeURIComponent(contentId)}/edit`
        : `/content/scenes/${encodeURIComponent(contentId)}/proofread`
      : `/content/import?batch_id=${encodeURIComponent(String(raw.batch_id))}`
    for (const issue of issues)
      problems.push({
        itemId: String(item.item_id),
        title,
        location: String(issue.path || issue.field || issue.import_entry_id || '正文与素材'),
        message: String(issue.message || issue.code || '需要人工校对'),
        failed: false,
        destination
      })
    if (isFailed)
      problems.push({
        itemId: String(item.item_id),
        title,
        location: String(result.stage || '处理阶段'),
        message: String(result.error_code || '处理失败，请查看阶段记录'),
        failed: true,
        destination
      })
  }
  const counts = record(raw.counts)
  /**
   * 优先采用服务端计数，未返回且无法推导时保留空值
   * @param key - 当前需要展示的计数字段
   * @param fallback - 从完整逐篇明细可确定的计数
   * @returns 当前操作结果或完成状态
   */
  const count = (key: string, fallback: number | null): number | null =>
    typeof counts[key] === 'number' ? (counts[key] as number) : fallback
  return {
    id: String(raw.batch_id),
    status: String(raw.status),
    problems,
    counts: {
      total: count('total', items?.length ?? null),
      processing: count('processing', items ? processing : null),
      normal: count('normal', items ? normal : null),
      proofreading: count('proofreading', items ? proofreading : null),
      failed: count('failed', items ? failed : null),
      confirmed: count('confirmed', null),
      publishable: count('publishable', null),
      published: count('published', items ? published : null),
      cancelled: count('cancelled', items ? cancelled : null)
    },
    usage: raw.usage && typeof raw.usage === 'object' ? record(raw.usage) : null
  }
}
/**
 * 读取可恢复的导入批次
 * @param client - 当前管理员认证客户端
 * @returns 当前操作结果或完成状态
 */
export const createImportBatchOverviewAdapter = (client: ApiClient) => ({
  /**
   * 读取批次逐篇明细
   * @param id - 导入完成后生成的稳定批次编号
   * @param signal - 离页或切换批次时的请求取消信号
   * @returns 当前持久化批次与明确结果
   */
  load: async (id: string, signal?: AbortSignal): Promise<ImportBatchOverview> =>
    mapImportBatchOverview(
      await client.request<Row>({
        method: 'GET',
        path: `/api/v1/admin/content-imports/${encodeURIComponent(id)}`,
        signal
      })
    )
})
