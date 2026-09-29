import { getCapability } from '@/shared/capabilities/capability-registry'

import type { ApiClient } from '@/services/api/api-client'

export type ContactCorrectionAction = 'approve' | 'reject'
export type ContactStatus =
  'NOT_PROVIDED' | 'PENDING' | 'CONTACTED' | 'UNREACHABLE' | 'DO_NOT_CONTACT'
export type ContactCorrectionStatus =
  'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export interface ContactProjectionDto {
  change_pending: boolean
  contact_status: ContactStatus
  updated_at: string
  user_id: string
  verified_at: string | null
  verified_by: string | null
  wechat_id: string | null
}

export interface ContactTimelineDto {
  actor_id: string
  actor_type: string
  event_type: string
  occurred_at: string
  status: string
}

export interface ContactCorrectionDto {
  created_at: string
  id: string
  juya_number: string
  nickname: string | null
  processed_at: string | null
  reason: string
  status: ContactCorrectionStatus
  timeline: ContactTimelineDto[]
  user_id: string
  wechat_id: string | null
}

export interface ContactCorrectionPageDto {
  items: ContactCorrectionDto[]
  page: number
  page_size: number
  total: number
}

export interface CorrectionDecisionDto {
  id: string
  processed_at: string
  status: 'APPROVED' | 'REJECTED'
}

export interface ContactCapabilities {
  readonly canCopySensitiveValue: boolean
  auditCopy(userId: string, signal?: AbortSignal): Promise<void>
  decideCorrection(
    id: string,
    action: ContactCorrectionAction,
    idempotencyKey: string,
    signal?: AbortSignal
  ): Promise<CorrectionDecisionDto>
  getCorrection(id: string, signal?: AbortSignal): Promise<ContactCorrectionDto>
  listCorrections(
    status?: ContactCorrectionStatus,
    signal?: AbortSignal
  ): Promise<ContactCorrectionPageDto>
  updateStatus(
    userId: string,
    status: ContactStatus,
    signal?: AbortSignal
  ): Promise<ContactProjectionDto>
  verifyChange(userId: string, signal?: AbortSignal): Promise<ContactProjectionDto>
}

export interface ClipboardWriter {
  writeText(value: string): Promise<void> | void
}

/**
 * 在服务端成功记录复制审计后写入系统剪贴板
 *
 * @param capabilities - 联系资料能力对象
 * @param userId - 用户公开编号
 * @param value - 待复制的完整联系方式
 * @param clipboard - 可替换的剪贴板写入器
 * @param signal - 可选请求取消信号
 * @returns 复制完成后的 Promise
 */
export async function copyContactValue(
  capabilities: ContactCapabilities,
  userId: string,
  value: string,
  clipboard: ClipboardWriter = navigator.clipboard,
  signal?: AbortSignal
): Promise<void> {
  await capabilities.auditCopy(userId, signal)
  await clipboard.writeText(value)
}

/**
 * 创建联系资料查询、命令和敏感复制审计适配器
 *
 * @param client - 统一 API 客户端
 * @returns 联系资料能力对象
 */
export function createContactCapabilities(client: ApiClient): ContactCapabilities {
  const canCopySensitiveValue = getCapability('contacts.copy-audit') === 'available'

  return {
    canCopySensitiveValue,
    async auditCopy(userId, signal) {
      await client.request<void>({
        method: 'POST',
        path: `/api/v1/admin/users/${encodeURIComponent(userId)}/contact-copy-events`,
        signal
      })
    },
    async decideCorrection(id, action, idempotencyKey, signal) {
      const source = await client.request<unknown>({
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/contact-corrections/${encodeURIComponent(id)}/commands/${action}`,
        signal
      })
      return parseDecision(source)
    },
    async getCorrection(id, signal) {
      const source = await client.request<unknown>({
        method: 'GET',
        path: `/api/v1/admin/contact-corrections/${encodeURIComponent(id)}`,
        signal
      })
      return parseCorrection(source)
    },
    async listCorrections(status, signal) {
      const source = await client.request<unknown>({
        method: 'GET',
        path: '/api/v1/admin/contact-corrections',
        query: { page: 1, page_size: 20, status },
        signal
      })
      return parseCorrectionPage(source)
    },
    async updateStatus(userId, status, signal) {
      const source = await client.request<unknown>({
        body: { status },
        method: 'POST',
        path: `/api/v1/admin/users/${encodeURIComponent(userId)}/commands/contact-status`,
        signal
      })
      return parseContactProjection(source)
    },
    async verifyChange(userId, signal) {
      const source = await client.request<unknown>({
        method: 'POST',
        path: `/api/v1/admin/users/${encodeURIComponent(userId)}/commands/verify-contact-change`,
        signal
      })
      return parseContactProjection(source)
    }
  }
}

/**
 * 校验联系投影响应。
 * @param source - 未知接口响应
 * @returns 已校验的联系投影
 */
function parseContactProjection(source: unknown): ContactProjectionDto {
  const value = requireRecord(source, '联系资料响应格式不正确')
  return {
    change_pending: requireBoolean(value, 'change_pending'),
    contact_status: requireContactStatus(value, 'contact_status'),
    updated_at: requireString(value, 'updated_at'),
    user_id: requireString(value, 'user_id'),
    verified_at: requireNullableString(value, 'verified_at'),
    verified_by: requireNullableString(value, 'verified_by'),
    wechat_id: requireNullableString(value, 'wechat_id')
  }
}

/**
 * 校验联系更正分页响应。
 * @param source - 未知接口响应
 * @returns 已校验的更正分页
 */
function parseCorrectionPage(source: unknown): ContactCorrectionPageDto {
  const value = requireRecord(source, '联系更正列表响应格式不正确')
  if (!Array.isArray(value.items)) throw new Error('联系更正列表缺少 items')
  return {
    items: value.items.map(parseCorrection),
    page: requireNumber(value, 'page'),
    page_size: requireNumber(value, 'page_size'),
    total: requireNumber(value, 'total')
  }
}

/**
 * 校验联系更正详情响应。
 * @param source - 未知接口响应
 * @returns 已校验的更正详情
 */
function parseCorrection(source: unknown): ContactCorrectionDto {
  const value = requireRecord(source, '联系更正详情响应格式不正确')
  if (!Array.isArray(value.timeline)) throw new Error('联系更正详情缺少 timeline')
  return {
    created_at: requireString(value, 'created_at'),
    id: requireString(value, 'id'),
    juya_number: requireString(value, 'juya_number'),
    nickname: requireNullableString(value, 'nickname'),
    processed_at: requireNullableString(value, 'processed_at'),
    reason: requireString(value, 'reason'),
    status: requireCorrectionStatus(value, 'status'),
    timeline: value.timeline.map(parseTimeline),
    user_id: requireString(value, 'user_id'),
    wechat_id: requireNullableString(value, 'wechat_id')
  }
}

/**
 * 校验联系更正时间线条目。
 * @param source - 未知接口响应
 * @returns 已校验的时间线条目
 */
function parseTimeline(source: unknown): ContactTimelineDto {
  const value = requireRecord(source, '联系更正时间线响应格式不正确')
  return {
    actor_id: requireString(value, 'actor_id'),
    actor_type: requireString(value, 'actor_type'),
    event_type: requireString(value, 'event_type'),
    occurred_at: requireString(value, 'occurred_at'),
    status: requireString(value, 'status')
  }
}

/**
 * 校验联系更正决定响应。
 * @param source - 未知接口响应
 * @returns 已校验的决定结果
 */
function parseDecision(source: unknown): CorrectionDecisionDto {
  const value = requireRecord(source, '联系更正命令响应格式不正确')
  const status = requireString(value, 'status')
  if (status !== 'APPROVED' && status !== 'REJECTED') throw new Error('联系更正决定状态无效')
  return {
    id: requireString(value, 'id'),
    processed_at: requireString(value, 'processed_at'),
    status
  }
}

/**
 * 读取普通对象。
 * @param source - 未知值
 * @param message - 格式错误提示
 * @returns 普通记录对象
 */
function requireRecord(source: unknown, message: string): Record<string, unknown> {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    throw new Error(message)
  }
  return source as Record<string, unknown>
}

/**
 * 读取必填字符串。
 * @param source - 来源对象
 * @param key - 字段名
 * @returns 非空字符串
 */
function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`联系资料缺少字段：${key}`)
  return value
}

/**
 * 读取可空字符串。
 * @param source - 来源对象
 * @param key - 字段名
 * @returns 字符串或空值
 */
function requireNullableString(source: Record<string, unknown>, key: string): string | null {
  if (source[key] === null) return null
  return requireString(source, key)
}

/**
 * 读取有限数字。
 * @param source - 来源对象
 * @param key - 字段名
 * @returns 有限数字
 */
function requireNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`联系资料缺少数字字段：${key}`)
  }
  return value
}

/**
 * 读取布尔值。
 * @param source - 来源对象
 * @param key - 字段名
 * @returns 布尔值
 */
function requireBoolean(source: Record<string, unknown>, key: string): boolean {
  const value = source[key]
  if (typeof value !== 'boolean') throw new Error(`联系资料缺少布尔字段：${key}`)
  return value
}

/**
 * 读取五种联系状态。
 * @param source - 来源对象
 * @param key - 字段名
 * @returns 合法联系状态
 */
function requireContactStatus(source: Record<string, unknown>, key: string): ContactStatus {
  const value = requireString(source, key)
  if (
    value !== 'NOT_PROVIDED' &&
    value !== 'PENDING' &&
    value !== 'CONTACTED' &&
    value !== 'UNREACHABLE' &&
    value !== 'DO_NOT_CONTACT'
  ) {
    throw new Error(`联系状态无效：${value}`)
  }
  return value
}

/**
 * 读取联系更正状态。
 * @param source - 来源对象
 * @param key - 字段名
 * @returns 合法更正状态
 */
function requireCorrectionStatus(
  source: Record<string, unknown>,
  key: string
): ContactCorrectionStatus {
  const value = requireString(source, key)
  if (
    value !== 'PENDING' &&
    value !== 'PROCESSING' &&
    value !== 'APPROVED' &&
    value !== 'REJECTED' &&
    value !== 'CANCELLED'
  ) {
    throw new Error(`联系更正状态无效：${value}`)
  }
  return value
}
