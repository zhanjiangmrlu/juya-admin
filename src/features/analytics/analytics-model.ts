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
  values: (number | null)[]
  xAxis: string[]
}

export interface RatioInput {
  denominator: number
  numerator: number
}
export interface RatioViewModel extends RatioInput {
  rate: number | null
}

export interface AnalyticsRatio extends RatioViewModel {
  basis: string
  day: string
  metric: string
}

export interface AnalyticsSnapshot {
  end: string
  period: AnalyticsPeriod
  ratios: AnalyticsRatio[]
  rows: AnalyticsRow[]
  start: string
  timezone: 'Asia/Shanghai'
}

const anonymousDimensions = new Set([
  'ALL',
  'NUMERATOR',
  'DENOMINATOR',
  'NOT_PROVIDED',
  'PENDING',
  'CONTACTED',
  'UNREACHABLE',
  'DO_NOT_CONTACT',
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
  'CANCELLED',
  'RESOLVED',
  'PROCESSING',
  'NEED_MORE',
  'USER_SUPPLIED',
  'CLOSED_INSUFFICIENT',
  'CONTENT',
  'TECHNICAL',
  'OTHER',
  'MODE_3',
  'MODE_5'
])

export const RATIO_BASES: Readonly<Record<string, string>> = {
  CONTACT_FUNNEL: '填写次数 / 提示曝光次数',
  FEEDBACK_SLA: 'SLA 内处理数量 / 纳入 SLA 统计的反馈数量',
  LIMITED_COMPLETIONS: '到期前完成人数 / 首次启动人数',
  LIMITED_STARTS: '首次启动人数 / 开通人数'
}

export const METRIC_LABELS: Readonly<Record<string, string>> = {
  ACTIVE_USERS: '活跃用户（日级计数合计）',
  CONTACT_FUNNEL: '联系资料漏斗',
  DELETIONS: '注销生效',
  FAVORITES: '收藏',
  FEEDBACK_SLA: '反馈 SLA',
  FORMAL_ENTITLEMENTS: '正式权益',
  LIMITED_COMPLETIONS: '限时完成',
  LIMITED_STARTS: '限时首次启动',
  NEW_USERS: '新增用户',
  REVIEWS: '复习',
  SCENE_COMPLETIONS: '场景完成'
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
  const personalPattern =
    /user|wechat|openid|phone|mobile|email|nickname|juya|screenshot|trajectory|wx[_-]?id/i
  if (rows.some((row) => !allowed.has(row.metric)))
    return { message: '统计响应包含未知指标', valid: false }
  if (
    rows.some(
      (row) =>
        !anonymousDimensions.has(row.dimension.toUpperCase()) &&
        (!/^(scene|series|package|campaign):[\w-]{1,64}$/.test(row.dimension) ||
          personalPattern.test(row.dimension))
    )
  )
    return { message: '统计响应包含个人标识维度', valid: false }
  if (
    rows.some(
      (row) =>
        !Number.isSafeInteger(row.value) ||
        row.value < 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.day) ||
        dayjs(row.day).format('YYYY-MM-DD') !== row.day
    )
  )
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
    const day = dayjs(row.day)
    const bucket =
      period === 'day'
        ? row.day
        : period === 'week'
          ? day.subtract((day.day() + 6) % 7, 'day').format('YYYY-MM-DD')
          : day.startOf('month').format('YYYY-MM-DD')
    const key = `${METRIC_LABELS[row.metric] ?? row.metric} · ${row.dimension === 'ALL' ? '全部' : row.dimension}`
    const values = buckets.get(key) ?? new Map<string, number>()
    values.set(bucket, (values.get(bucket) ?? 0) + row.value)
    buckets.set(key, values)
  }
  const xAxis = [...new Set([...buckets.values()].flatMap((values) => [...values.keys()]))].sort()
  return [...buckets.entries()].map(([label, values]) => ({
    label,
    values: xAxis.map((day) => values.get(day) ?? null),
    xAxis
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
