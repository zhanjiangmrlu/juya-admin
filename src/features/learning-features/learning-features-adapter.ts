import { hasAdminOperation } from '@/shared/contracts/contract-capabilities'

import type { LearningFeaturesSnapshot } from './use-learning-features'
import type { ApiClient } from '@/services/api/api-client'

const base = '/api/v1/admin/learning-features'
/**
 * 校验独立录音开关与真实配置版本
 * @param value - 管理接口返回的完整配置
 * @returns 严格布尔值及非负版本
 */
const parse = (value: unknown): LearningFeaturesSnapshot => {
  const row = value as {
    recording_enabled?: unknown
    profile_completion_enabled?: unknown
    version?: unknown
  } | null
  if (
    !row ||
    typeof row.recording_enabled !== 'boolean' ||
    typeof row.profile_completion_enabled !== 'boolean' ||
    !Number.isSafeInteger(row.version) ||
    Number(row.version) < 0
  )
    throw new Error('录音配置响应缺少开关或有效版本')
  return {
    recordingEnabled: row.recording_enabled,
    profileCompletionEnabled: row.profile_completion_enabled,
    version: Number(row.version)
  }
}
/**
 * 消费后端学习功能权威配置；旧快照未挂载时不发送猜测请求
 * @param client - 已认证管理客户端
 * @returns 独立读取和 CAS 幂等保存能力
 */
export const createLearningFeaturesAdapter = (client: ApiClient) => ({
  available: hasAdminOperation(base, 'get') && hasAdminOperation(base, 'put'),
  /** 读取实际录音审核配置
   * @returns 当前独立开关及版本
   */ load: async () => parse(await client.request({ method: 'GET', path: base })),
  /**
   * 保存明确目标开关与读取版本
   * @param enabled - 管理员确认的录音权限
   * @param profileEnabled - 管理员确认的资料次级入口
   * @param version - 读取时的独立配置版本
   * @param key - 相同命令重试复用的幂等键
   * @returns 服务端实际新状态
   */ save: async (enabled: boolean, profileEnabled: boolean, version: number, key: string) =>
    parse(
      await client.request({
        method: 'PUT',
        path: base,
        headers: { 'Idempotency-Key': key },
        body: {
          recording_enabled: enabled,
          profile_completion_enabled: profileEnabled,
          expected_version: version
        }
      })
    )
})
