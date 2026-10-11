import type { ApiClient } from '@/services/api/api-client'
export interface ProofreadingCandidate {
  content_type: 'dialogue' | 'word_card' | 'short_reading'
  content_id: string
  revision_id: string
  candidate_hash: string
  normal?: boolean
  failure?: { error_code: string; reported_revision?: string }
  classification_facts?: Record<string, unknown>
}
export interface ProofreadingSet {
  public_id: string
  collection_hash: string
  candidates: ProofreadingCandidate[]
  sample_ids: string[]
  confirmed_ids: string[]
  normal_count: number
  status: string
}
export interface ProofreadingChecks {
  text_checked: boolean
  images_checked: boolean
  audio_listened: boolean
}
const base = '/api/v1/admin/content/proofreading'
export const /**
   * 规范排序完整候选 JSON，保持数组顺序和原始文本
   * @param value - 服务端候选字段
   * @returns 确定性的候选结构
   */ canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
          )
        : value
export const /**
   * 计算完整候选哈希，修改任何字段都会撤销旧确认
   * @param content - 完整服务端候选快照
   * @returns SHA256 候选身份
   */ candidateHash = async (content: Record<string, unknown>): Promise<string> => {
    const bytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(canonical(content)))
    )
    return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join(
      ''
    )
  }
export const /**
   * 使用真实校对集合和逐项人工确认命令
   * @param client - 当前认证管理客户端
   * @returns 校对集合操作
   */ createProofreadingAdapter = (client: ApiClient) => ({
    /**
     * 对明确人工核对的新版场景草稿集中确认本篇词条
     * @param candidates - 固定修订、编辑版本及完整内容哈希
     * @returns 各候选实际执行结果
     */ confirmEntries: (
      candidates: { revision_id: string; expected_version: number; candidate_hash: string }[]
    ) =>
      client.request<{
        items: { revision_id: string; status: string; error_code?: string }[]
        status: string
      }>({
        method: 'POST',
        path: '/api/v1/admin/content/revisions/entry-confirmations',
        body: { candidates, manual_checked: true }
      }),
    /**
     * 建立固定候选集合并读取服务端抽样
     * @param candidates - 明确选中的候选版本和哈希
     * @returns 持久化集合
     */ create: async (candidates: ProofreadingCandidate[]): Promise<ProofreadingSet> => {
      const result = await client.request<ProofreadingSet>({
        method: 'POST',
        path: base,
        body: { candidates }
      })
      return client.request({
        method: 'GET',
        path: `${base}/${encodeURIComponent(result.public_id)}`
      })
    },
    /**
     * 恢复服务端集合
     * @param id - 校对集合编号
     * @returns 当前集合和已确认候选
     */ load: (id: string): Promise<ProofreadingSet> =>
      client.request({ method: 'GET', path: `${base}/${encodeURIComponent(id)}` }),
    /**
     * 追加明确选择的抽样版本
     * @param id - 当前校对集合
     * @param revisions - 管理员追加的候选版本
     * @returns 请求完成
     */ append: (id: string, revisions: string[]): Promise<unknown> =>
      client.request({
        method: 'POST',
        path: `${base}/${encodeURIComponent(id)}/samples`,
        body: { revision_ids: revisions }
      }),
    /**
     * 确认当前固定候选的人工作业事实
     * @param id - 校对集合编号
     * @param revision - 明确核对的候选修订
     * @param hash - 核对时完整候选哈希
     * @param checks - 管理员逐项勾选的事实
     * @returns 请求完成
     */ confirm: (
      id: string,
      revision: string,
      hash: string,
      checks: ProofreadingChecks
    ): Promise<unknown> =>
      client.request({
        method: 'POST',
        path: `${base}/${encodeURIComponent(id)}/items/${encodeURIComponent(revision)}/confirm`,
        body: { candidate_hash: hash, ...checks }
      }),
    /**
     * 登记异常并撤销所在集合批准
     * @param id - 当前校对集合
     * @param revision - 异常候选修订
     * @param errorCode - 人工发现的明确异常
     * @returns 请求完成
     */ fail: (id: string, revision: string, errorCode: string): Promise<unknown> =>
      client.request({
        method: 'POST',
        path: `${base}/${encodeURIComponent(id)}/items/${encodeURIComponent(revision)}/fail`,
        body: { error_code: errorCode }
      }),
    /**
     * 接受抽样通过后明确选择的正常结构化结果
     * @param id - 当前固定集合
     * @param hash - 当前服务端集合哈希
     * @param revisions - 管理员明确选中的正常候选
     * @param key - 当前批准动作失败重试复用的身份
     * @returns 服务端批准结果
     */ bulk: (id: string, hash: string, revisions: string[], key: string): Promise<unknown> =>
      client.request({
        method: 'POST',
        path: `${base}/${encodeURIComponent(id)}/normal/bulk-confirm`,
        headers: { 'Idempotency-Key': key },
        body: { collection_hash: hash, revision_ids: revisions, accept_normal_results: true }
      }),
    /**
     * 请求服务端完成当前固定集合校对
     * @param id - 当前固定集合
     * @param holdAbnormal - 是否明确保留未批准异常为草稿
     * @returns 请求完成
     */ complete: (id: string, holdAbnormal = false): Promise<unknown> =>
      client.request({
        method: 'POST',
        path: `${base}/${encodeURIComponent(id)}/complete`,
        body: { allow_abnormal_drafts: holdAbnormal }
      })
  })
