import { createContentAdapter } from '@/features/content/content-adapter'
import {
  candidateHash,
  type ProofreadingCandidate
} from '@/features/proofreading/proofreading-adapter'
import { createShortReadingAdapter } from '@/features/short-reading/short-reading-adapter'
import { hasAdminOperation } from '@/shared/contracts/contract-capabilities'

import type { ApiClient } from '@/services/api/api-client'

import { createPublishAdapter } from './publish-adapter'

export interface PublicationCandidate extends ProofreadingCandidate {
  expected_version: number
  expected_edit_version?: number
  warning_codes: string[]
}
export interface PublicationPrepared {
  candidate: PublicationCandidate
  errorCodes: string[]
  warningCodes: string[]
}
export interface PublicationRange {
  token: string
  collection_hash: string
  version: number
  status: string
  expires_at: string
  candidates: PublicationCandidate[]
  results: { items: Record<string, { status: string; error_code?: string }> }
}
export interface PublicationRangeAdapter {
  prepare(candidates: ProofreadingCandidate[]): Promise<PublicationPrepared[]>
  preview(candidates: PublicationCandidate[]): Promise<PublicationRange>
  load(token: string): Promise<PublicationRange>
  confirm(range: PublicationRange, selected: string[], key: string): Promise<void>
}
const base = '/api/v1/admin/content/publication-ranges'
/**
 * 消费固定范围令牌，场景与短文保留各自版本和检查规则
 * @param client - 当前认证管理员客户端
 * @returns 明确集合预检查、冻结、恢复及异步发布
 */
export const createPublicationRangeAdapter = (client: ApiClient) => {
  const scenes = createContentAdapter(client)
  const readings = createShortReadingAdapter(client)
  const publisher = createPublishAdapter(client)
  return {
    available: hasAdminOperation(base, 'post'),
    /**
     * 从实际草稿重新读取身份，旧校对哈希变化必须重新校对
     * @param candidates - 服务端已批准的明确候选
     * @returns 绑定双版本的预检查与待明确确认警告
     */ prepare: async (candidates: ProofreadingCandidate[]): Promise<PublicationPrepared[]> => {
      const prepared: PublicationPrepared[] = []
      for (let offset = 0; offset < candidates.length; offset += 10) {
        const group = await Promise.all(
          candidates.slice(offset, offset + 10).map(async (candidate) => {
            const row =
              candidate.content_type === 'short_reading'
                ? await readings.load(candidate.content_id)
                : await scenes.getRevision(candidate.revision_id)
            const hash = 'contentHash' in row ? row.contentHash : await candidateHash(row.content)
            if (
              ('revisionId' in row ? row.revisionId : row.id) !== candidate.revision_id ||
              hash !== candidate.candidate_hash
            )
              throw new Error('已校对候选的正文或修订已变化，请重新校对')
            const check =
              candidate.content_type === 'short_reading'
                ? await readings.check(candidate.revision_id)
                : await publisher.check(candidate.revision_id, [])
            return {
              candidate: {
                content_type: candidate.content_type,
                content_id: candidate.content_id,
                revision_id: candidate.revision_id,
                candidate_hash: hash,
                expected_version: row.version,
                ...('editVersion' in row ? { expected_edit_version: row.editVersion } : {}),
                warning_codes: []
              },
              errorCodes: [...('errors' in check ? check.errors : check.errorCodes)],
              warningCodes: [...('warningCodes' in check ? check.warningCodes : [])]
            }
          })
        )
        prepared.push(...group)
      }
      return prepared
    },
    /**
     * 冻结已明确核对的集合，实际 ready 由服务端再验证
     * @param candidates - 完整固定身份与明确警告集合
     * @returns 持久化范围令牌
     */ preview: (candidates: PublicationCandidate[]): Promise<PublicationRange> =>
      client.request({ method: 'POST', path: base, body: { candidates } }),
    /**
     * 恢复创建管理员的范围与逐项结果
     * @param token - 服务端固定范围令牌
     * @returns 实际状态，不把 202 当完成
     */ load: (token: string): Promise<PublicationRange> =>
      client.request({ method: 'GET', path: `${base}/${encodeURIComponent(token)}` }),
    /**
     * 只发布范围中的明确子集；请求身份随相同载荷重试保持
     * @param range - 已冻结且仍有效的范围
     * @param selected - 管理员明确勾选的候选修订
     * @param key - 不确定响应保留的命令键
     * @returns 异步任务已提交状态
     */ confirm: async (
      range: PublicationRange,
      selected: string[],
      key: string
    ): Promise<void> => {
      await client.request({
        method: 'POST',
        path: `${base}/${encodeURIComponent(range.token)}/confirm`,
        headers: { 'Idempotency-Key': key },
        body: {
          manual_confirmed: true,
          expected_version: range.version,
          collection_hash: range.collection_hash,
          selected_revision_ids: selected
        }
      })
    }
  }
}
