import type { LimitedEntitlementOperation } from './limited-entitlement-model'
import type { ApiClient } from '@/services/api/api-client'

export interface LimitedEntitlement {
  activatedAt: string | null
  campaignVersionId: string
  expiresAt: string | null
  grantedAt: string
  id: string
  remedyCount: number
  startDeadline: string
  status: string
  userId: string
  version: number
}

export interface LimitedEntitlementCommandInput {
  campaignVersionId: string | null
  entitlementId: string | null
  operation: LimitedEntitlementOperation
  reason?: string
  userId: string | null
}

export interface LimitedEntitlementAdapter {
  execute(
    input: LimitedEntitlementCommandInput,
    idempotencyKey: string
  ): Promise<LimitedEntitlement>
}

/**
 * 创建限时权益授予与状态命令适配器
 *
 * @param client - 统一 API 客户端
 * @returns 限时权益命令适配器
 */
export function createLimitedEntitlementAdapter(client: ApiClient): LimitedEntitlementAdapter {
  return {
    /**
     * 根据操作类型调用对应限时权益命令接口
     *
     * @param input - 权益编号、开通字段、操作和可选原因
     * @param idempotencyKey - 当前逻辑操作复用的幂等键
     * @returns 服务端持久化后的限时权益
     */
    async execute(input, idempotencyKey) {
      const request = toRequest(input)
      const response = await client.request<unknown>({
        body: request.body,
        idempotencyKey,
        method: 'POST',
        path: request.path
      })
      return parseLimitedEntitlement(response)
    }
  }
}

/**
 * 将限时权益命令映射为真实接口路径和请求体
 *
 * @param input - 限时权益命令输入
 * @returns API 请求路径和请求体
 */
function toRequest(input: LimitedEntitlementCommandInput): { body?: unknown; path: string } {
  if (input.operation === 'GRANT') {
    if (!input.userId || !input.campaignVersionId) throw new Error('开通限时权益缺少用户或活动版本')
    return {
      body: { campaign_version_id: input.campaignVersionId, user_id: input.userId },
      path: '/api/v1/admin/limited-entitlements/commands/grant'
    }
  }
  if (!input.entitlementId) throw new Error('限时权益操作缺少权益编号')
  const basePath = `/api/v1/admin/limited-entitlements/${encodeURIComponent(input.entitlementId)}/commands`
  if (input.operation === 'EXTEND_START_DEADLINE' || input.operation === 'RESTORE_START_WINDOW') {
    return { body: { mode: input.operation }, path: `${basePath}/remedy` }
  }
  if (input.operation === 'RESUME') return { path: `${basePath}/resume` }
  return {
    body: { reason: input.reason },
    path: `${basePath}/${input.operation.toLowerCase()}`
  }
}

/**
 * 校验并映射限时权益接口响应
 *
 * @param source - 接口返回的未知值
 * @returns 字段完整的限时权益视图模型
 */
function parseLimitedEntitlement(source: unknown): LimitedEntitlement {
  if (!isRecord(source)) throw new Error('限时权益接口响应格式不正确')
  return {
    activatedAt: nullableString(source, 'activated_at'),
    campaignVersionId: requireString(source, 'campaign_version_id'),
    expiresAt: nullableString(source, 'expires_at'),
    grantedAt: requireString(source, 'granted_at'),
    id: requireString(source, 'id'),
    remedyCount: requireNumber(source, 'remedy_count'),
    startDeadline: requireString(source, 'start_deadline'),
    status: requireString(source, 'status'),
    userId: requireString(source, 'user_id'),
    version: requireNumber(source, 'version')
  }
}

/**
 * 读取可为空的字符串字段
 *
 * @param source - 接口响应对象
 * @param key - 字段名
 * @returns 字符串字段或空值
 */
function nullableString(source: Record<string, unknown>, key: string): string | null {
  return source[key] === null ? null : requireString(source, key)
}

/**
 * 读取必需字符串字段
 *
 * @param source - 接口响应对象
 * @param key - 字段名
 * @returns 非空字符串字段
 */
function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`限时权益缺少字段：${key}`)
  return value
}

/**
 * 读取必需有限数字字段
 *
 * @param source - 接口响应对象
 * @param key - 字段名
 * @returns 有限数字字段
 */
function requireNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`限时权益缺少字段：${key}`)
  return value
}

/**
 * 判断未知值是否为普通记录对象
 *
 * @param value - 需要判断的未知值
 * @returns 值是否为非空且非数组对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
