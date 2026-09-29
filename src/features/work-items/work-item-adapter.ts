import type { ApiClient } from '@/services/api/api-client'

export interface WorkItemDto {
  due_at: string
  key: string
  kind: string
  priority_rank: number
}

export interface WorkItemAdapter {
  getWorkItems(signal?: AbortSignal): Promise<WorkItemDto[]>
}

/**
 * 创建保持服务端排序的待办接口适配器
 *
 * @param client - 统一 API 客户端
 * @returns 待办查询适配器
 */
export function createWorkItemAdapter(client: ApiClient): WorkItemAdapter {
  return {
    /**
     * 读取服务端按 priority_rank、due_at、key 排序的待办
     *
     * @param signal - 可选请求取消信号
     * @returns 不改变顺序的待办数组
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
 * 校验并转换单条待办响应
 *
 * @param source - 待办数组中的未知元素
 * @returns 字段完整的待办对象
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
 * 从待办对象读取非空字符串
 *
 * @param source - 待办响应对象
 * @param key - 字符串字段名
 * @returns 非空字符串字段
 */
function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`待办接口缺少字段：${key}`)
  return value
}

/**
 * 从待办对象读取有限数字
 *
 * @param source - 待办响应对象
 * @param key - 数字字段名
 * @returns 有限数字字段
 */
function requireNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`待办接口缺少字段：${key}`)
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
