import { hasAdminOperation } from '@/shared/contracts/contract-capabilities'

import type { ApiClient } from '@/services/api/api-client'

export interface PronunciationAdminStatus {
  target_id: string
  target_status: string
  target_type: string
  allow_synthesis: boolean
  synthesis_enabled: boolean
  source: string | null
  resource_version: string | null
  task: { public_id: string; status: string; attempt: number; error_code: string | null } | null
  attempts: {
    attempt: number
    status: string
    actual_characters: number | null
    actual_cost: number | null
    currency: string
  }[]
}
const base = '/api/v1/admin/pronunciations'
export const /**
   * 管理端只读发音事实与固定文件，不提交文字或调用内部合成解析
   * @param client - 当前认证管理客户端
   * @returns 状态、短期试听与本地恢复接口
   */ createPronunciationAdminAdapter = (client: ApiClient) => ({
    available: hasAdminOperation(`${base}/targets/{target_id}`, 'get'),
    /**
     * 读取已确认目标的当前发音配置与实际用量
     * @param targetId - 本篇服务端已确认的发音目标
     * @returns 不触发新收费任务的真实状态
     */ status: (targetId: string): Promise<PronunciationAdminStatus> =>
      client.request({ method: 'GET', path: `${base}/targets/${encodeURIComponent(targetId)}` }),
    /**
     * 只对已读取固定资源版本请求试听地址
     * @param targetId - 已确认目标
     * @param version - 状态响应给出的资源版本
     * @returns 校验后的短期文件预览
     */ preview: (
      targetId: string,
      version: string
    ): Promise<{ resource_version: string; url: string; expires_in: number }> =>
      client.request({
        method: 'POST',
        path: `${base}/targets/${encodeURIComponent(targetId)}/preview`,
        body: { resource_version: version }
      }),
    /**
     * 仅恢复已经留存音频的本地阶段，服务端拒绝未知收费结果
     * @param taskId - 真实 RECOVER 任务编号
     * @returns 不新增计费的恢复回执
     */ recover: (
      taskId: string
    ): Promise<{ task_id: string; status: string; paid_retry: boolean }> =>
      client.request({
        method: 'POST',
        path: `${base}/tasks/${encodeURIComponent(taskId)}/retry`
      })
  })
