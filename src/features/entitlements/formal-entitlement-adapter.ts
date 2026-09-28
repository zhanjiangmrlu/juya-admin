import type { FormalEntitlementOperation, FormalEntitlementTerm } from './formal-entitlement-model'
import type { ApiClient } from '@/services/api/api-client'

export interface FormalEntitlement {
  expiresAt: string | null
  grantedAt: string
  id: string
  packageId: string
  status: string
  term: FormalEntitlementTerm
  userId: string
  version: number
}

export interface FormalEntitlementPayload {
  packageId: string
  reason?: string
  term: FormalEntitlementTerm | null
  userId: string
}

export interface FormalEntitlementAdapter {
  execute(
    operation: FormalEntitlementOperation,
    payload: FormalEntitlementPayload,
    idempotencyKey: string
  ): Promise<FormalEntitlement>
  preview(
    operation: FormalEntitlementOperation,
    payload: FormalEntitlementPayload
  ): Promise<FormalEntitlement>
}

/**
 * 创建正式权益预览与命令接口适配器。
 *
 * @param client - 统一 API 客户端。
 * @returns 正式权益接口适配器。
 */
export function createFormalEntitlementAdapter(client: ApiClient): FormalEntitlementAdapter {
  return {
    /**
     * 执行正式权益写命令。
     *
     * @param operation - 授予、续期、暂停、恢复或撤销操作。
     * @param payload - 用户、内容包、期限和可选原因。
     * @param idempotencyKey - 当前逻辑操作复用的幂等键。
     * @returns 服务端持久化后的正式权益。
     */
    async execute(operation, payload, idempotencyKey) {
      const response = await client.request<unknown>({
        body: toApiPayload(payload),
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/formal-entitlements/commands/${operation}`
      })
      return parseFormalEntitlement(response)
    },

    /**
     * 从服务端预览正式权益操作结果且不落库。
     *
     * @param operation - 需要预览的权益操作。
     * @param payload - 用户、内容包、期限和可选原因。
     * @returns 服务端计算的生效时间、到期时间与目标状态。
     */
    async preview(operation, payload) {
      const response = await client.request<unknown>({
        body: toApiPayload(payload),
        method: 'POST',
        path: '/api/v1/admin/formal-entitlements/preview-operation',
        query: { operation }
      })
      return parseFormalEntitlement(response)
    }
  }
}

/**
 * 将前端正式权益输入映射为接口字段。
 *
 * @param payload - 前端正式权益输入。
 * @returns 符合接口契约的下划线字段对象。
 */
function toApiPayload(payload: FormalEntitlementPayload): Record<string, unknown> {
  return {
    package_id: payload.packageId,
    reason: payload.reason,
    term: payload.term,
    user_id: payload.userId
  }
}

/**
 * 校验并映射服务端正式权益响应。
 *
 * @param source - 接口返回的未知值。
 * @returns 字段完整的正式权益视图模型。
 */
function parseFormalEntitlement(source: unknown): FormalEntitlement {
  if (!isRecord(source)) throw new Error('正式权益接口响应格式不正确')
  return {
    expiresAt: source.expires_at === null ? null : requireString(source, 'expires_at'),
    grantedAt: requireString(source, 'granted_at'),
    id: requireString(source, 'id'),
    packageId: requireString(source, 'package_id'),
    status: requireString(source, 'status'),
    term: requireTerm(source.term),
    userId: requireString(source, 'user_id'),
    version: requireNumber(source, 'version')
  }
}

/**
 * 校验正式权益期限枚举。
 *
 * @param value - 接口返回的期限字段。
 * @returns 已校验的正式权益期限。
 */
function requireTerm(value: unknown): FormalEntitlementTerm {
  const terms: readonly string[] = [
    'MONTH_1',
    'MONTH_2',
    'MONTH_3',
    'MONTH_6',
    'MONTH_12',
    'PERMANENT'
  ]
  if (typeof value !== 'string' || !terms.includes(value)) {
    throw new Error('正式权益接口缺少有效期限')
  }
  return value as FormalEntitlementTerm
}

/**
 * 从接口对象读取必需字符串。
 *
 * @param source - 接口响应对象。
 * @param key - 字符串字段名。
 * @returns 非空字符串字段值。
 */
function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`正式权益缺少字段：${key}`)
  return value
}

/**
 * 从接口对象读取有限数字。
 *
 * @param source - 接口响应对象。
 * @param key - 数字字段名。
 * @returns 有限数字字段值。
 */
function requireNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`正式权益缺少数字字段：${key}`)
  }
  return value
}

/**
 * 判断未知值是否为普通记录对象。
 *
 * @param value - 需要判断的未知值。
 * @returns 值是否为非空且非数组对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
