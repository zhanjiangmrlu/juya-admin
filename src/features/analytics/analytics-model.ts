import dayjs from 'dayjs'

export const ANALYTICS_METRICS = [
  'ACTIVE_USERS',
  'CONTACT_FUNNEL',
  'DELETIONS',
  'FAVORITES',
  'FEEDBACK_SLA',
  'FORMAL_ENTITLEMENTS',
  'LIMITED_COMPLETIONS',
  'LIMITED_STARTS',
  'NEW_USERS',
  'REVIEWS',
  'SCENE_COMPLETIONS'
] as const

export type AnalyticsPeriod = 'day' | 'month' | 'week'

export interface AnalyticsRow {
  day: string
  dimension: string
  metric: string
  value: number
}

export interface AnalyticsSeries {
  label: string
  values: number[]
  xAxis: string[]
}

export interface RatioInput {
  denominator: number
  numerator: number
}
export interface RatioViewModel extends RatioInput {
  rate: number | null
}

/**
 * 拒绝未知指标、非法数值和个人标识维度
 *
 * @param rows - 服务端统计行
 * @returns 匿名汇总数据校验结果
 */
export function validateAnalyticsRows(rows: readonly AnalyticsRow[]): {
  message: string
  valid: boolean
} {
  const allowed = new Set<string>(ANALYTICS_METRICS)
  const personalPattern = /(user|wechat|openid|phone|mobile|email|wx[_-]?id)/i
  if (rows.some((row) => !allowed.has(row.metric)))
    return { message: '统计响应包含未知指标', valid: false }
  if (rows.some((row) => personalPattern.test(row.dimension)))
    return { message: '统计响应包含个人标识维度', valid: false }
  if (rows.some((row) => !Number.isFinite(row.value) || row.value < 0))
    return { message: '统计响应包含非法数值', valid: false }
  return { message: '校验通过', valid: true }
}

/**
 * 按日、周或月汇总统计行
 *
 * @param rows - 已校验统计行
 * @param period - 汇总周期
 * @returns 按指标和维度拆分的序列
 */
export function groupAnalyticsRows(
  rows: readonly AnalyticsRow[],
  period: AnalyticsPeriod
): AnalyticsSeries[] {
  const buckets = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const bucket = period === 'day' ? row.day : dayjs(row.day).startOf(period).format('YYYY-MM-DD')
    const key = `${row.metric} · ${row.dimension}`
    const values = buckets.get(key) ?? new Map<string, number>()
    values.set(bucket, (values.get(bucket) ?? 0) + row.value)
    buckets.set(key, values)
  }
  return [...buckets.entries()].map(([label, values]) => ({
    label,
    values: [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => value),
    xAxis: [...values.keys()].sort()
  }))
}

/**
 * 创建保留分子分母口径的比率视图
 *
 * @param input - 分子和分母
 * @returns 比率视图模型
 */
export function toRatioViewModel(input: RatioInput): RatioViewModel {
  return { ...input, rate: input.denominator === 0 ? null : input.numerator / input.denominator }
}
