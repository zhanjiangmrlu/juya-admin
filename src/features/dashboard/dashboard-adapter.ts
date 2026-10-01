import { createWorkItemAdapter } from '@/features/work-items/work-item-adapter'

import type { WorkItemDto } from '@/features/work-items/work-item-adapter'
import type { ApiClient } from '@/services/api/api-client'

export type { WorkItemDto } from '@/features/work-items/work-item-adapter'

export interface DashboardSnapshotDto {
  new_users_today?: number
  open_completed_without_contact?: number
  pending_contacts?: number
  limited_pending?: number
  limited_learning?: number
  urgent_feedback?: number
  entitlement_warning_days?: number
  active_users: number
  expiring_entitlements: number
  failed_jobs: number
  open_feedback: number
  overdue_feedback: number
}

export interface DashboardAdapter {
  getSnapshot(signal?: AbortSignal): Promise<DashboardSnapshotDto>
  getWorkItems(signal?: AbortSignal): Promise<WorkItemDto[]>
}

/**
 * 创建工作台快照与待办接口适配器
 *
 * @param client - 统一 API 客户端
 * @returns 提供快照和待办查询的适配器
 */
export function createDashboardAdapter(client: ApiClient): DashboardAdapter {
  const workItemAdapter = createWorkItemAdapter(client)
  return {
    /**
     * 读取当前工作台汇总指标
     *
     * @param signal - 可选请求取消信号
     * @returns 已校验的工作台快照
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
     * 读取服务端已按 priority_rank 排序的活动待办
     *
     * @param signal - 可选请求取消信号
     * @returns 不改变服务端顺序的待办数组
     */
    async getWorkItems(signal?: AbortSignal): Promise<WorkItemDto[]> {
      return workItemAdapter.getWorkItems(signal)
    }
  }
}

/**
 * 校验并转换工作台快照响应
 *
 * @param source - 后端返回的未知对象
 * @returns 字段完整的工作台快照
 */
function parseDashboardSnapshot(source: Record<string, unknown>): DashboardSnapshotDto {
  return {
    new_users_today:
      typeof source.new_users_today === 'number' ? source.new_users_today : undefined,
    open_completed_without_contact:
      typeof source.open_completed_without_contact === 'number'
        ? source.open_completed_without_contact
        : undefined,
    pending_contacts:
      typeof source.pending_contacts === 'number' ? source.pending_contacts : undefined,
    limited_pending:
      typeof source.limited_pending === 'number' ? source.limited_pending : undefined,
    limited_learning:
      typeof source.limited_learning === 'number' ? source.limited_learning : undefined,
    urgent_feedback:
      typeof source.urgent_feedback === 'number' ? source.urgent_feedback : undefined,
    entitlement_warning_days:
      typeof source.entitlement_warning_days === 'number'
        ? source.entitlement_warning_days
        : undefined,
    active_users: requireNumber(source, 'active_users'),
    expiring_entitlements: requireNumber(source, 'expiring_entitlements'),
    failed_jobs: requireNumber(source, 'failed_jobs'),
    open_feedback: requireNumber(source, 'open_feedback'),
    overdue_feedback: requireNumber(source, 'overdue_feedback')
  }
}

/**
 * 从接口对象读取有限数字字段
 *
 * @param source - 接口响应对象
 * @param key - 数字字段名
 * @returns 对应数字值
 */
function requireNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`工作台接口响应缺少数字字段：${key}`)
  }
  return value
}
