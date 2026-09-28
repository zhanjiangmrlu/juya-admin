import type { ApiClient } from '@/services/api/api-client'

export interface DashboardSnapshotDto {
  active_users: number
  expiring_entitlements: number
  failed_jobs: number
  open_feedback: number
  overdue_feedback: number
}

export interface WorkItemDto {
  due_at: string
  key: string
  kind: string
  priority_rank: number
}

export interface DashboardAdapter {
  getSnapshot(signal?: AbortSignal): Promise<DashboardSnapshotDto>
  getWorkItems(signal?: AbortSignal): Promise<WorkItemDto[]>
}

/**
 * 创建工作台快照与待办接口适配器。
 *
 * @param client - 统一 API 客户端。
 * @returns 提供快照和待办查询的适配器。
 */
export function createDashboardAdapter(client: ApiClient): DashboardAdapter {
  return {
    /**
     * 读取当前工作台汇总指标。
     *
     * @param signal - 可选请求取消信号。
     * @returns 已校验的工作台快照。
     */
    async getSnapshot(signal?: AbortSignal): Promise<DashboardSnapshotDto> {
      const response = await client.request<Record<string, unknown>>({
        method: 'GET',
        path: '/api/v1/admin/dashboard',
        signal
      })
      return parseDashboardSnapshot(response)
    },

    /**
     * 读取服务端已按 priority_rank 排序的活动待办。
     *
     * @param signal - 可选请求取消信号。
     * @returns 不改变服务端顺序的待办数组。
     */
    async getWorkItems(signal?: AbortSignal): Promise<WorkItemDto[]> {
      const response = await client.request<unknown>({
        method: 'GET',
        path: '/api/v1/admin/work-items',
        signal
      })
      if (!Array.isArray(response)) throw new Error('待办接口响应格式不正确')
      return response.map(parseWorkItem)
    }
  }
}

/**
 * 校验并转换工作台快照响应。
 *
 * @param source - 后端返回的未知对象。
 * @returns 字段完整的工作台快照。
 */
function parseDashboardSnapshot(source: Record<string, unknown>): DashboardSnapshotDto {
  return {
    active_users: requireNumber(source, 'active_users'),
    expiring_entitlements: requireNumber(source, 'expiring_entitlements'),
    failed_jobs: requireNumber(source, 'failed_jobs'),
    open_feedback: requireNumber(source, 'open_feedback'),
    overdue_feedback: requireNumber(source, 'overdue_feedback')
  }
}

/**
 * 校验并转换单条待办响应。
 *
 * @param source - 待办数组中的未知元素。
 * @returns 字段完整的待办对象。
 */
function parseWorkItem(source: unknown): WorkItemDto {
  if (!isRecord(source)) throw new Error('待办接口响应格式不正确')
  return {
    due_at: requireString(source, 'due_at'),
    key: requireString(source, 'key'),
    kind: requireString(source, 'kind'),
    priority_rank: requireNumber(source, 'priority_rank')
  }
}

/**
 * 从接口对象读取有限数字字段。
 *
 * @param source - 接口响应对象。
 * @param key - 数字字段名。
 * @returns 对应数字值。
 */
function requireNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`工作台接口响应缺少数字字段：${key}`)
  }
  return value
}

/**
 * 从接口对象读取必需字符串字段。
 *
 * @param source - 接口响应对象。
 * @param key - 字符串字段名。
 * @returns 对应非空字符串。
 */
function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`工作台接口响应缺少字符串字段：${key}`)
  }
  return value
}

/**
 * 判断未知值是否为非空记录对象。
 *
 * @param value - 需要判断的未知值。
 * @returns 值是否可按记录对象读取。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
