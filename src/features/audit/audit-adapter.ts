import { formatAdminActor } from '@/shared/utils/admin-actor'

import type { ApiClient } from '@/services/api/api-client'

export interface AuditEvent {
  action: string
  actor: string
  afterSummary: Readonly<Record<string, unknown>>
  beforeSummary: Readonly<Record<string, unknown>>
  objectId: string
  objectType: string
  occurredAt: string
  reason: string | null
  requestId: string
}

export interface AuditAdapter {
  list(limit?: number): Promise<AuditEvent[]>
}

/**
 * 创建脱敏审计事件读取适配器
 *
 * @param client - 统一 API 客户端
 * @returns 审计事件适配器
 */
export function createAuditAdapter(client: ApiClient): AuditAdapter {
  return {
    /**
     * 加载最近审计事件
     *
     * @param limit - 返回条数上限
     * @returns 脱敏审计事件数组
     */
    async list(limit = 50) {
      const response = await client.request<unknown>({
        method: 'GET',
        path: '/api/v1/admin/audit-events',
        query: { limit }
      })
      if (!isRecord(response) || !Array.isArray(response.items))
        throw new Error('审计事件响应格式不正确')
      return response.items.map(parseEvent)
    }
  }
}

/**
 * 校验并映射单个审计事件
 *
 * @param source - 服务端审计事件
 * @returns 审计事件视图模型
 */
function parseEvent(source: unknown): AuditEvent {
  if (!isRecord(source)) throw new Error('审计事件格式不正确')
  const event = source
  /**
   * 读取审计事件必需字符串字段
   *
   * @param key - 审计字段名
   * @returns 字符串字段值
   */
  function text(key: string): string {
    if (typeof event[key] !== 'string') throw new Error(`审计事件缺少字段：${key}`)
    return event[key]
  }
  return {
    action: text('action'),
    actor: formatAdminActor(event.actor_public_id, event.actor_name),
    afterSummary: isRecord(event.after_summary) ? event.after_summary : {},
    beforeSummary: isRecord(event.before_summary) ? event.before_summary : {},
    objectId: text('object_public_id'),
    objectType: text('object_type'),
    occurredAt: text('occurred_at'),
    reason: event.reason === null ? null : text('reason'),
    requestId: text('request_id')
  }
}

/** 判断未知值是否为普通记录对象
 * @param value - 需要判断的未知值
 * @returns 是否为普通记录对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
