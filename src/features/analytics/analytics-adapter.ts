import type { AnalyticsPeriod, AnalyticsSnapshot } from './analytics-model'
import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

import { RATIO_BASES, validateAnalyticsRows } from './analytics-model'

type AnalyticsDto = components['schemas']['AnalyticsResponse']

export interface AnalyticsAdapter {
  query(
    start: string,
    end: string,
    period: AnalyticsPeriod,
    signal?: AbortSignal
  ): Promise<AnalyticsSnapshot>
}

/**
 * 创建使用生成契约且拒绝个人维度的匿名统计适配器
 * @param client - 统一 API 客户端
 * @returns 统计查询适配器
 */
export function createAnalyticsAdapter(client: ApiClient): AnalyticsAdapter {
  return {
    async query(start, end, period, signal) {
      if (!['day', 'week', 'month'].includes(period)) throw new Error('统计周期不正确')
      const response = await client.request<AnalyticsDto>({
        method: 'GET',
        path: '/api/v1/admin/analytics',
        query: { end, period, start },
        signal
      })
      if (
        response.period !== period ||
        response.start !== start ||
        response.end !== end ||
        response.timezone !== 'Asia/Shanghai' ||
        !Array.isArray(response.rows) ||
        !Array.isArray(response.ratios)
      )
        throw new Error('统计查询响应口径不一致')
      const rows = response.rows.map((row) => ({
        day: row.day,
        dimension: row.dimension,
        metric: row.metric,
        value: row.value
      }))
      const validation = validateAnalyticsRows(rows)
      if (!validation.valid) throw new Error(validation.message)
      const ratios = response.ratios.map((ratio) => {
        const { basis, day, denominator, metric, numerator, rate } = ratio
        if (
          !RATIO_BASES[metric] ||
          basis !== RATIO_BASES[metric] ||
          !Number.isSafeInteger(numerator) ||
          !Number.isSafeInteger(denominator) ||
          numerator < 0 ||
          numerator > denominator ||
          (denominator === 0
            ? rate !== null
            : rate === null ||
              !Number.isFinite(rate) ||
              Math.abs(rate - numerator / denominator) > 1e-10) ||
          !validateAnalyticsRows([{ day, dimension: 'ALL', metric, value: numerator }]).valid
        )
          throw new Error('统计比率缺少有效分子、分母或口径')
        return { basis, day, denominator, metric, numerator, rate }
      })
      return { end, period, ratios, rows, start, timezone: 'Asia/Shanghai' }
    }
  }
}
