import dayjs from 'dayjs'

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
      /**
       * 计算请求口径的自然周期起点
       * @param day - 已校验日期
       * @returns 周一、月初或原自然日
       */
      function bucket(day: string): string {
        return period === 'week'
          ? dayjs(day)
              .subtract((dayjs(day).day() + 6) % 7, 'day')
              .format('YYYY-MM-DD')
          : period === 'month'
            ? dayjs(day).startOf('month').format('YYYY-MM-DD')
            : day
      }
      const first = bucket(start)
      const last = bucket(end)
      const counts = new Map<string, number>()
      const components = new Set<string>()
      for (const row of rows) {
        const key = `${row.day}/${row.metric}/${row.dimension}`
        if (row.day < first || row.day > last || bucket(row.day) !== row.day || counts.has(key))
          throw new Error('统计行包含错误日期桶或重复计数')
        counts.set(key, row.value)
        if (['NUMERATOR', 'DENOMINATOR'].includes(row.dimension))
          components.add(`${row.day}/${row.metric}`)
      }
      const seenRatios = new Set<string>()
      const ratios = response.ratios.map((ratio) => {
        const { basis, day, denominator, metric, numerator, rate } = ratio
        const key = `${day}/${metric}`
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
          !validateAnalyticsRows([{ day, dimension: 'ALL', metric, value: numerator }]).valid ||
          seenRatios.has(key) ||
          counts.get(`${key}/NUMERATOR`) !== numerator ||
          counts.get(`${key}/DENOMINATOR`) !== denominator
        )
          throw new Error('统计比率缺少有效分子、分母或口径')
        seenRatios.add(key)
        return { basis, day, denominator, metric, numerator, rate }
      })
      if ([...components].some((key) => !seenRatios.has(key)))
        throw new Error('统计比率缺少成对响应')
      return { end, period, ratios, rows, start, timezone: 'Asia/Shanghai' }
    }
  }
}
