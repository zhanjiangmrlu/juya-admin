import type { FeedbackStatus } from './feedback-model'
import type { ApiClient } from '@/services/api/api-client'

export interface FeedbackTicket {
  category: string
  closedAt: string | null
  createdAt: string
  deadlineAt: string
  description: string
  id: string
  reopenCount: number
  resolvedAt: string | null
  slaRemainingSeconds: number | null
  source: Readonly<Record<string, unknown>>
  status: FeedbackStatus
  supplementRounds: number
  updatedAt: string
  userId: string
}

export type FeedbackCommandType = 'CLOSE' | 'REQUEST_SUPPLEMENT' | 'RESOLVE' | 'START'

export interface FeedbackCommandInput {
  payload?: Readonly<Record<string, unknown>>
  ticketId: string
  type: FeedbackCommandType
}

export interface FeedbackAdapter {
  execute(input: FeedbackCommandInput, idempotencyKey: string): Promise<FeedbackTicket>
  getDetail(ticketId: string, signal?: AbortSignal): Promise<FeedbackTicket>
}

/**
 * 创建反馈详情与命令接口适配器
 *
 * @param client - 统一 API 客户端
 * @returns 反馈接口适配器
 */
export function createFeedbackAdapter(client: ApiClient): FeedbackAdapter {
  return {
    /**
     * 执行指定反馈命令
     *
     * @param input - 反馈编号、命令类型与请求体
     * @param idempotencyKey - 当前逻辑操作复用的幂等键
     * @returns 命令返回的反馈详情
     */
    async execute(input, idempotencyKey) {
      const commandPath =
        input.type === 'CLOSE' ? 'close-insufficient' : input.type.toLowerCase().replace('_', '-')
      const response = await client.request<unknown>({
        body: input.payload,
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/feedback/${encodeURIComponent(input.ticketId)}/commands/${commandPath}`
      })
      return parseFeedbackTicket(response)
    },

    /**
     * 读取单条真实反馈详情
     *
     * @param ticketId - 反馈编号
     * @param signal - 可选请求取消信号
     * @returns 已校验的反馈详情
     */
    async getDetail(ticketId, signal) {
      const response = await client.request<unknown>({
        method: 'GET',
        path: `/api/v1/admin/feedback/${encodeURIComponent(ticketId)}`,
        signal
      })
      return parseFeedbackTicket(response)
    }
  }
}

/**
 * 校验并映射反馈详情响应
 *
 * @param source - 接口返回的未知值
 * @returns 反馈详情视图模型
 */
function parseFeedbackTicket(source: unknown): FeedbackTicket {
  if (!isRecord(source)) throw new Error('反馈详情接口响应格式不正确')
  return {
    category: requireString(source, 'category'),
    closedAt: nullableString(source, 'closed_at'),
    createdAt: requireString(source, 'created_at'),
    deadlineAt: requireString(source, 'deadline_at'),
    description: requireString(source, 'description'),
    id: requireString(source, 'id'),
    reopenCount: requireNumber(source, 'reopen_count'),
    resolvedAt: nullableString(source, 'resolved_at'),
    slaRemainingSeconds: nullableNumber(source, 'sla_remaining_seconds'),
    source: isRecord(source.source) ? source.source : {},
    status: requireStatus(source.status),
    supplementRounds: requireNumber(source, 'supplement_rounds'),
    updatedAt: requireString(source, 'updated_at'),
    userId: requireString(source, 'user_id')
  }
}

/**
 * 校验反馈状态
 *
 * @param value - 接口返回的状态字段
 * @returns 已校验的反馈状态
 */
function requireStatus(value: unknown): FeedbackStatus {
  const statuses: readonly string[] = [
    'PENDING',
    'PROCESSING',
    'NEED_MORE',
    'USER_SUPPLIED',
    'RESOLVED',
    'CLOSED_INSUFFICIENT'
  ]
  if (typeof value !== 'string' || !statuses.includes(value))
    throw new Error('反馈详情缺少有效状态')
  return value as FeedbackStatus
}

/**
 * 读取必需字符串字段
 *
 * @param source - 反馈响应对象
 * @param key - 字段名
 * @returns 非空字符串
 */
function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string') throw new Error(`反馈详情缺少字段：${key}`)
  return value
}

/**
 * 读取必需有限数字字段
 *
 * @param source - 反馈响应对象
 * @param key - 字段名
 * @returns 有限数字
 */
function requireNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`反馈详情缺少字段：${key}`)
  return value
}

/**
 * 读取可为空字符串字段
 *
 * @param source - 反馈响应对象
 * @param key - 字段名
 * @returns 字符串或空值
 */
function nullableString(source: Record<string, unknown>, key: string): string | null {
  return source[key] === null ? null : requireString(source, key)
}

/**
 * 读取可为空数字字段
 *
 * @param source - 反馈响应对象
 * @param key - 字段名
 * @returns 数字或空值
 */
function nullableNumber(source: Record<string, unknown>, key: string): number | null {
  return source[key] === null ? null : requireNumber(source, key)
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
