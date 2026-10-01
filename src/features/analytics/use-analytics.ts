import { readonly, ref, shallowRef } from 'vue'

import type { AnalyticsAdapter } from './analytics-adapter'
import type {
  ActivityBasis,
  AnalyticsPeriod,
  AnalyticsRatio,
  AnalyticsRow
} from './analytics-model'
import type { DeepReadonly, Ref } from 'vue'

import { validateAnalyticsRows } from './analytics-model'

export interface AnalyticsController {
  activityBasis: Readonly<Ref<ActivityBasis | null>>
  error: Readonly<Ref<string | null>>
  isLoading: Readonly<Ref<boolean>>
  load(start: string, end: string, period?: AnalyticsPeriod): Promise<void>
  ratios: DeepReadonly<Ref<AnalyticsRatio[]>>
  rows: DeepReadonly<Ref<AnalyticsRow[]>>
}

/**
 * 创建匿名统计加载控制器
 *
 * @param adapter - 统计接口适配器
 * @returns 统计加载控制器
 */
export function useAnalytics(adapter: AnalyticsAdapter): AnalyticsController {
  const activityBasis = ref<ActivityBasis | null>(null)
  const rows = shallowRef<AnalyticsRow[]>([])
  const ratios = shallowRef<AnalyticsRatio[]>([])
  const error = ref<string | null>(null)
  const isLoading = ref(false)
  let sequence = 0
  let abortController: AbortController | null = null

  /**
   * 加载并校验指定日期区间的统计行
   *
   * @param start - 起始日期
   * @param end - 结束日期
   * @param period - 汇总周期
   * @returns 加载完成后的 Promise
   */
  async function load(start: string, end: string, period: AnalyticsPeriod = 'day'): Promise<void> {
    abortController?.abort()
    abortController = new AbortController()
    const current = ++sequence
    isLoading.value = true
    error.value = null
    rows.value = []
    ratios.value = []
    activityBasis.value = null
    try {
      const snapshot = await adapter.query(start, end, period, abortController.signal)
      if (current !== sequence) return
      const nextRows = snapshot.rows
      const validation = validateAnalyticsRows(nextRows)
      if (!validation.valid) throw new Error(validation.message)
      rows.value = nextRows
      ratios.value = snapshot.ratios
      activityBasis.value = snapshot.activityBasis
    } catch (failure) {
      if (current !== sequence) return
      error.value = failure instanceof Error ? failure.message : '统计加载失败'
      rows.value = []
    } finally {
      if (current === sequence) isLoading.value = false
    }
  }

  return {
    activityBasis: readonly(activityBasis),
    error: readonly(error),
    isLoading: readonly(isLoading),
    load,
    ratios: readonly(ratios),
    rows: readonly(rows)
  }
}
