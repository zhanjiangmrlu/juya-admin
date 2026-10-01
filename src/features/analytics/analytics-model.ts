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
  'SCENE_COMPLETIONS',
  'CONTACT_STATE_CHANGES',
  'FORMAL_STATE_CHANGES',
  'LIMITED_STATE_CHANGES',
  'FEEDBACK_STATE_CHANGES',
  'SCENE_STARTS',
  'OPEN_SCENE_COMPLETIONS',
  'OPEN_ALL_COMPLETIONS',
  'OPEN_ALL_RATE',
  'OPEN_LEARNERS',
  'CONTACT_EXPOSURES',
  'CONTACT_SUBMISSIONS',
  'CONTACT_WITHDRAWALS',
  'CONTACT_STATES',
  'CONTACT_WITHDRAW_RATE',
  'FORMAL_STATES',
  'FORMAL_EXPIRATIONS',
  'LIMITED_GRANTS',
  'LIMITED_EXPIRATIONS',
  'LIMITED_START_EXPIRATIONS',
  'LIMITED_STATES',
  'REVISITS',
  'FEEDBACK_NEW',
  'FEEDBACK_RESPONSES',
  'FEEDBACK_RESPONSE_SECONDS',
  'FEEDBACK_SUPPLEMENTS',
  'FEEDBACK_SUPPLEMENT_ROUNDS',
  'FEEDBACK_RESOLUTIONS',
  'FEEDBACK_REOPENS',
  'FEEDBACK_TIMEOUTS',
  'FEEDBACK_STATES',
  'FEEDBACK_SOLVE_RATE',
  'FEEDBACK_REOPEN_RATE',
  'FEEDBACK_TIMEOUT_RATE',
  'DELETION_REQUESTS',
  'DELETION_WITHDRAWALS'
] as const

export type AnalyticsPeriod = 'day' | 'month' | 'week'
export type ActivityBasis =
  'PERSON_DAYS' | 'CALENDAR_WEEK_USERS' | 'CALENDAR_MONTH_USERS' | 'DAILY_USERS'
export const ACTIVITY_BASIS_LABELS: Record<ActivityBasis, string> = {
  PERSON_DAYS: '活跃人日（自定义区间的每日活跃人数合计）',
  CALENDAR_WEEK_USERS: '自然周独立活跃用户（每周内去重）',
  CALENDAR_MONTH_USERS: '自然月独立活跃用户（每月内去重）',
  DAILY_USERS: '日活跃用户（每日内去重）'
}

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
  unit?: 'ratio' | 'seconds'
  dimension?: string
  basis: string
  day: string
  metric: string
}

export interface AnalyticsSnapshot {
  activityBasis: ActivityBasis
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
  'MODE_5',
  'ENDED',
  'START_EXPIRED',
  'PAUSED',
  'PRONUNCIATION',
  'DISPLAY',
  'FUNCTION',
  'MODE_3_NUMERATOR',
  'MODE_3_DENOMINATOR',
  'MODE_5_NUMERATOR',
  'MODE_5_DENOMINATOR'
])

export const RATIO_BASES: Readonly<Record<string, string>> = {
  FEEDBACK_RESPONSE_SECONDS: '累计首次响应秒数 / 首次响应反馈数量',
  CONTACT_FUNNEL: '填写次数 / 提示曝光次数',
  LIMITED_START_EXPIRATIONS: '未开始失效人数 / 开通人数',
  CONTACT_WITHDRAW_RATE: '撤回次数 / 填写次数',
  OPEN_ALL_RATE: '三开放场景全部完成人数 / 开放场景启动人数',
  FEEDBACK_SOLVE_RATE: '解决数量 / 新增反馈数量',
  FEEDBACK_REOPEN_RATE: '重开数量 / 已解决反馈数量',
  FEEDBACK_TIMEOUT_RATE: '超时数量 / 新增反馈数量',
  FEEDBACK_SLA: 'SLA 内处理数量 / 纳入 SLA 统计的反馈数量',
  LIMITED_COMPLETIONS: '到期前完成人数 / 首次启动人数',
  LIMITED_STARTS: '首次启动人数 / 开通人数'
}

export const METRIC_LABELS: Readonly<Record<string, string>> = {
  CONTACT_STATE_CHANGES: '联系状态变更',
  FORMAL_STATE_CHANGES: '正式权益状态变更',
  LIMITED_STATE_CHANGES: '限时权益状态变更',
  FEEDBACK_STATE_CHANGES: '反馈状态变更',
  SCENE_STARTS: '场景开始',
  OPEN_SCENE_COMPLETIONS: '开放场景完成',
  OPEN_ALL_COMPLETIONS: '三开放场景全部完成',
  OPEN_ALL_RATE: '三开放场景全完成率',
  OPEN_LEARNERS: '开放场景学习人数',
  CONTACT_EXPOSURES: '联系提示曝光',
  CONTACT_SUBMISSIONS: '联系资料填写',
  CONTACT_WITHDRAWALS: '联系资料撤回',
  CONTACT_STATES: '联系资料状态',
  CONTACT_WITHDRAW_RATE: '联系撤回率',
  FORMAL_STATES: '正式权益状态',
  FORMAL_EXPIRATIONS: '正式权益到期',
  LIMITED_GRANTS: '限时开通',
  LIMITED_EXPIRATIONS: '限时到期',
  LIMITED_START_EXPIRATIONS: '限时未开始失效',
  LIMITED_STATES: '限时权益状态',
  REVISITS: '回访',
  FEEDBACK_NEW: '新增反馈',
  FEEDBACK_RESPONSES: '反馈响应',
  FEEDBACK_RESPONSE_SECONDS: '反馈首次响应秒数',
  FEEDBACK_SUPPLEMENTS: '反馈补充',
  FEEDBACK_SUPPLEMENT_ROUNDS: '反馈补充轮次',
  FEEDBACK_RESOLUTIONS: '反馈解决',
  FEEDBACK_REOPENS: '反馈重开',
  FEEDBACK_TIMEOUTS: '反馈超时',
  FEEDBACK_STATES: '反馈状态',
  FEEDBACK_SOLVE_RATE: '反馈解决率',
  FEEDBACK_REOPEN_RATE: '反馈重开率',
  FEEDBACK_TIMEOUT_RATE: '反馈超时率',
  DELETION_REQUESTS: '注销申请',
  DELETION_WITHDRAWALS: '注销撤回',
  ACTIVE_USERS: '活跃用户',
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
