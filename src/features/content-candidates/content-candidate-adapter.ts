import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

export type CandidateKind = components['schemas']['QueueCandidateRequest']['kind']
/**
 * 将自动音频初始化失败转换为可操作的服务配置与恢复说明
 * @param code - 服务端保存的自动音频失败码
 * @returns 管理员可执行的修正指引
 */
export const audioProductionFailureLabel = (code: string | null): string => {
  const labels: Readonly<Record<string, string>> = {
    CANDIDATE_PROVIDER_UNAVAILABLE: '音文识别服务未配置，请检查服务配置后明确重试失败阶段',
    CLOUD_BUDGET_DISABLED: '云调用硬预算未配置，请设置预算后明确重试失败阶段',
    CLOUD_BUDGET_EXHAUSTED: '云调用硬预算已用尽，请核对额度与费用后明确重试失败阶段',
    AUTO_AUDIO_INPUT_CHANGED: '正文或整段音频已变化，请保存当前草稿并重新检查自动音频',
    AUTO_AUDIO_FAILED: '自动音频调度失败，请读取失败阶段，排查服务后明确重试'
  }
  return code && Object.hasOwn(labels, code)
    ? labels[code]!
    : '自动音频任务未完成，请读取失败阶段并核对服务配置与额度后明确重试'
}
export interface CandidateSelection {
  source_id: string
  english: string
  chinese: string
  start: number | null
  end: number | null
}
export interface AudioProductionState {
  stage_id: string
  status: string
  error_code: string | null
  candidate_id: string | null
  input_hash: string
}
export interface AsrAlignmentResult {
  text: string
  boundaries: { start_ms: number; end_ms: number }[]
  alignment_status?: 'ALIGNED' | 'NEEDS_REVIEW'
  issues?: { sentence_id: string; code: string; message: string }[]
  alignment?: { sentence_id: string; start_ms: number; end_ms: number; match_score: number }[]
  applied_edit_version?: number | null
}
export interface ProductionCandidate {
  id: string
  revision_id?: string
  status: string
  stage_id?: string | null
  stage_status?: string | null
  stale?: boolean
  input_hash: string
  candidate: {
    kind: CandidateKind
    edit_version: number
    sources: Record<string, string>
    source_sentences?: { sentence_id: string; english: string }[]
    audio?: { version_id: string }
    results?: CandidateSelection[] | AsrAlignmentResult
  }
}
/**
 * 恢复候选须绑定服务端修订；旧接口仅接受本页明确排队的来源
 * @param candidate - 已读取的候选归属
 * @param candidate.revision_id - 服务端返回的固定草稿编号
 * @param revisionId - 当前正在编辑的固定修订
 * @param queuedOrigin - 本页明确创建候选时记录的修订
 * @returns 是否属于当前草稿
 */
export const candidateBelongsToRevision = (
  candidate: { revision_id?: string },
  revisionId: string,
  queuedOrigin?: string
): boolean =>
  candidate.revision_id !== undefined
    ? candidate.revision_id === revisionId
    : queuedOrigin === revisionId
/**
 * 核对人工选择的 Unicode 位置确实属于原句，且有本篇中文
 * @param row - 人工核对后的来源位置和释义
 * @param sources - 候选固定原句
 * @returns 是否允许提交人工采纳
 */
export const validCandidateSelection = (
  row: CandidateSelection,
  sources: Record<string, string>
): boolean => {
  const source = Object.hasOwn(sources, row.source_id) ? sources[row.source_id] : undefined
  if (source === undefined || row.start === null || row.end === null || !row.chinese.trim())
    return false
  const points = Array.from(source)
  return (
    Number.isInteger(row.start) &&
    Number.isInteger(row.end) &&
    row.start >= 0 &&
    row.end > row.start &&
    row.end <= points.length &&
    points.slice(row.start, row.end).join('') === row.english
  )
}
/**
 * 使用实际候选与自动音频状态接口，机器结果保留人工校对状态
 * @param client - 已认证客户端
 * @returns 候选创建、恢复和单项采纳命令
 */
export const createContentCandidateAdapter = (client: ApiClient) => ({
  /**
   * 恢复当前草稿最近一次指定类型任务
   * @param revisionId - 当前已保存草稿编号
   * @param kind - 要恢复的生产任务类型
   * @returns 服务端真实候选；未创建时由接口返回404
   */ latest: (revisionId: string, kind: CandidateKind) =>
    client.request<ProductionCandidate>({
      method: 'GET',
      path: `/api/v1/admin/content/revisions/${encodeURIComponent(revisionId)}/candidates/latest`,
      query: { kind }
    }),
  /**
   * 读取自动音频调度阶段及真实失败原因
   * @param revisionId - 当前已保存草稿编号
   * @returns 真实自动任务状态；未创建时由接口返回404
   */ production: (revisionId: string) =>
    client.request<AudioProductionState>({
      method: 'GET',
      path: `/api/v1/admin/content/revisions/${encodeURIComponent(revisionId)}/audio-production`
    }),
  /**
   * 对固定草稿请求一种生产候选
   * @param revisionId - 已保存草稿编号
   * @param version - 已保存编辑版本
   * @param kind - 管理员选择的候选任务
   * @returns 实际任务编号
   */ queue: (revisionId: string, version: number, kind: CandidateKind) =>
    client.request<{ candidate_id: string; stage_id: string; status: string }>({
      method: 'POST',
      path: `/api/v1/admin/content/revisions/${encodeURIComponent(revisionId)}/candidates`,
      body: { kind, expected_version: version }
    }),
  /**
   * 恢复任务的实际候选结果
   * @param id - 服务端返回的候选编号
   * @returns 固定依赖候选
   */ get: (id: string) =>
    client.request<ProductionCandidate>({
      method: 'GET',
      path: `/api/v1/admin/content/candidates/${encodeURIComponent(id)}`
    }),
  /**
   * 采纳一项人工核对后的词汇或语块，不等于人工确认词条
   * @param id - 候选任务编号
   * @param index - 管理员选择的结果序号
   * @param row - 人工校正后的准确来源和中文
   * @param version - 当前已保存编辑版本
   * @param entryType - 本次采纳为词汇或语块
   * @returns 服务端保存结果
   */ adopt: (
    id: string,
    index: number,
    row: CandidateSelection,
    version: number,
    entryType: 'VOCABULARY' | 'PHRASE'
  ) =>
    client.request({
      method: 'POST',
      path: `/api/v1/admin/content/candidates/${encodeURIComponent(id)}/adoptions`,
      body: {
        index,
        source_id: row.source_id,
        chinese: row.chinese,
        start: row.start,
        end: row.end,
        expected_version: version,
        entry_type: entryType
      }
    })
})
