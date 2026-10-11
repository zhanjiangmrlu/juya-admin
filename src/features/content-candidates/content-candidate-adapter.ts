import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

export type CandidateKind = components['schemas']['QueueCandidateRequest']['kind']
export interface CandidateSelection {
  source_id: string
  english: string
  chinese: string
  start: number | null
  end: number | null
}
export interface ProductionCandidate {
  id: string
  revision_id?: string
  status: string
  input_hash: string
  candidate: {
    kind: CandidateKind
    edit_version: number
    sources: Record<string, string>
    audio?: { version_id: string }
    results?:
      CandidateSelection[] | { text: string; boundaries: { start_ms: number; end_ms: number }[] }
  }
}
export const /**
   * 恢复候选须绑定服务端修订；旧接口仅接受本页明确排队的来源
   * @param candidate - 已读取的候选归属
   * @param candidate.revision_id - 服务端返回的固定草稿编号
   * @param revisionId - 当前正在编辑的固定修订
   * @param queuedOrigin - 本页明确创建候选时记录的修订
   * @returns 是否属于当前草稿
   */ candidateBelongsToRevision = (
    candidate: { revision_id?: string },
    revisionId: string,
    queuedOrigin?: string
  ): boolean =>
    candidate.revision_id !== undefined
      ? candidate.revision_id === revisionId
      : queuedOrigin === revisionId
export const /**
   * 核对人工选择的 Unicode 位置确实属于原句，且有本篇中文
   * @param row - 人工核对后的来源位置和释义
   * @param sources - 候选固定原句
   * @returns 是否允许提交人工采纳
   */ validCandidateSelection = (
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
export const /**
   * 使用实际候选接口，ASR 只返回参考边界，不自动确认
   * @param client - 已认证客户端
   * @returns 候选创建、恢复和单项采纳命令
   */ createContentCandidateAdapter = (client: ApiClient) => ({
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
