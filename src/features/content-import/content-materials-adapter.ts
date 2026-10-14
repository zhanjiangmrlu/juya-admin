import { hasAdminOperation } from '@/shared/contracts/contract-capabilities'

import type { ApiClient } from '@/services/api/api-client'

export interface MaterialBinding {
  path: string
  role: string
  entry_id?: string
}
export interface MaterialBatch {
  batch_id: string
  status: string
  input_hash: string
  series_id?: string
  content_type?: string
  manifest: {
    has_vocabulary_table?: boolean
    vocabulary_rows?: unknown[]
    resources?: {
      path: string
      sha256: string
      allowed_roles: string[]
      ambiguous_title: boolean
      matching_candidates: { revision_id: string; edit_version: number; title_en: string }[]
      matching_candidate_count?: number
      suggestions_truncated?: boolean
      kind?: string
      filename?: string
    }[]
    binding_requests?: Record<string, unknown>
    results?: unknown
  }
}
const base = '/api/v1/admin/content-materials'
export const /**
   * 对接独立图片和音频素材 ZIP，所有角色由管理员明确绑定
   * @param client - 管理员认证客户端
   * @returns 素材上传、恢复、绑定及取消接口
   */ createContentMaterialsAdapter = (client: ApiClient) => ({
    available: hasAdminOperation(base, 'post'),
    /**
     * 上传独立素材包，不猜测标题或自动绑定
     * @param file - 管理员选择的 ZIP
     * @param seriesId - 目标系列
     * @param contentType - 目标内容模板
     * @param key - 上传重试身份
     * @returns 服务端任务编号
     */ upload: (file: File, seriesId: string, contentType: string, key: string) => {
      const body = new FormData()
      body.set('file', file)
      body.set('series_id', seriesId)
      body.set('content_type', contentType)
      return client.request<{ batch_id: string }>({
        method: 'POST',
        path: base,
        headers: { 'Idempotency-Key': key },
        body
      })
    },
    /**
     * 读取持久化素材清单与执行结果
     * @param id - 素材批次编号
     * @returns 实际文件与候选建议
     */ load: (id: string) =>
      client.request<MaterialBatch>({ method: 'GET', path: `${base}/${encodeURIComponent(id)}` }),
    /**
     * 保存明确勾选的角色绑定，不自动采用标题建议
     * @param id - 已校验素材批次
     * @param revisionId - 固定目标草稿
     * @param version - 固定编辑版本
     * @param bindings - 人工核对的文件、角色和稳定词条编号
     * @param key - 当前绑定动作的重试身份
     * @returns 实际任务结果
     */ bind: (
      id: string,
      revisionId: string,
      version: number,
      bindings: MaterialBinding[],
      key: string
    ) =>
      client.request({
        method: 'POST',
        path: `${base}/${encodeURIComponent(id)}/bindings`,
        headers: { 'Idempotency-Key': key },
        body: { revision_id: revisionId, expected_version: version, manual_checked: true, bindings }
      }),
    /**
     * 取消尚未完成的素材批次
     * @param id - 明确取消的批次
     * @returns 服务端取消结果
     */ cancel: (id: string) =>
      client.request({ method: 'POST', path: `${base}/${encodeURIComponent(id)}/cancel` })
  })
