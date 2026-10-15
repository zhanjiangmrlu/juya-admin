import { hasAdminOperation } from '@/shared/contracts/contract-capabilities'

import type { ApiClient } from '@/services/api/api-client'

export interface ContentStage {
  public_id: string
  item_id: string
  stage: string
  status: string
  input_hash: string
  config_version: string
  fencing_version: number
  attempt: number
  error_code: string | null
}
export interface ContentStageRetry {
  expected_fence: number
  input_hash: string
  config_version: string
  expected_edit_version?: number
  manual_confirmed: boolean
  acknowledged_charged_retry: boolean
}
const base = '/api/v1/admin/content-stages'
/**
 * 消费真实阶段租约与失败恢复契约，不用批次编号猜阶段编号
 * @param client - 已认证管理员客户端
 * @returns 实际状态读取与明确重试命令
 */
export const createContentStageAdapter = (client: ApiClient) => ({
  available: hasAdminOperation(`${base}/{stage_id}`, 'get'),
  batchAvailable: hasAdminOperation('/api/v1/admin/content-imports/{batch_id}/stages', 'get'),
  /**
   * 从真实批次关联读取阶段，不扫描或猜测其他阶段
   * @param batchId - 当前内容或素材批次
   * @param signal - 当前页面查询的取消信号
   * @returns 当前批次实际阶段选择列表
   */ forBatch: async (batchId: string, signal?: AbortSignal): Promise<ContentStage[]> => {
    const result = await client.request<{
      batch_id: string
      stages: (Omit<ContentStage, 'public_id'> & { stage_id: string })[]
    }>({
      method: 'GET',
      path: `/api/v1/admin/content-imports/${encodeURIComponent(batchId)}/stages`,
      signal
    })
    if (
      result.batch_id !== batchId ||
      !Array.isArray(result.stages) ||
      result.stages.some((stage) => stage.item_id !== batchId || !stage.stage_id)
    )
      throw new Error('阶段列表不属于当前导入批次')
    return result.stages.map((stage) => ({ ...stage, public_id: stage.stage_id }))
  },
  /**
   * 读取持久化阶段的固定依赖和失败状态
   * @param id - 服务端真实阶段编号
   * @returns 当前围栏、输入和版本
   */ load: (id: string): Promise<ContentStage> =>
    client.request({ method: 'GET', path: `${base}/${encodeURIComponent(id)}` }),
  /**
   * 只重试人工确认的失败阶段，成功阶段由服务端复用
   * @param id - 正在恢复的真实阶段
   * @param body - 读取事实及管理员明确确认
   * @param key - 相同请求丢响应后保留的命令键
   * @returns 排队回执，不能视为已成功
   */ retry: (
    id: string,
    body: ContentStageRetry,
    key: string
  ): Promise<{ stage_id: string; status: string }> =>
    client.request({
      method: 'POST',
      path: `${base}/${encodeURIComponent(id)}/retry`,
      headers: { 'Idempotency-Key': key },
      body
    })
})
