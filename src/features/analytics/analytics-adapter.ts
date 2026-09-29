import type { AnalyticsRow } from './analytics-model'
import type { ApiClient } from '@/services/api/api-client'

export interface AnalyticsAdapter {
  exportRows(start: string, end: string): Promise<AnalyticsRow[]>
}

/**
 * 创建匿名汇总统计接口适配器
 *
 * @param client - 统一 API 客户端
 * @returns 统计接口适配器
 */
export function createAnalyticsAdapter(client: ApiClient): AnalyticsAdapter {
  return {
    /**
     * 读取指定日期区间的匿名统计行
     *
     * @param start - 起始日期
     * @param end - 结束日期
     * @returns 已映射的统计行
     */
    async exportRows(start, end) {
      const response = await client.request<unknown>({
        method: 'GET',
        path: '/api/v1/admin/analytics/export',
        query: { end, start }
      })
      if (!Array.isArray(response)) throw new Error('统计接口响应格式不正确')
      return response.map(parseRow)
    }
  }
}

/**
 * 校验并映射单条统计行
 *
 * @param value - 接口返回的未知值
 * @returns 统计行
 */
function parseRow(value: unknown): AnalyticsRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('统计行格式不正确')
  const row = value as Record<string, unknown>
  if (
    typeof row.day !== 'string' ||
    typeof row.metric !== 'string' ||
    typeof row.dimension !== 'string' ||
    typeof row.value !== 'number'
  )
    throw new Error('统计行缺少必需字段')
  return { day: row.day, dimension: row.dimension, metric: row.metric, value: row.value }
}
