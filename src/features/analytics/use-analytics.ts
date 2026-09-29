import { readonly, ref, shallowRef } from 'vue'

import type { AnalyticsAdapter } from './analytics-adapter'
import type { AnalyticsRow } from './analytics-model'
import type { DeepReadonly, Ref } from 'vue'

import { validateAnalyticsRows } from './analytics-model'

export interface AnalyticsController {
  error: Readonly<Ref<string | null>>
  isLoading: Readonly<Ref<boolean>>
  load(start: string, end: string): Promise<void>
  rows: DeepReadonly<Ref<AnalyticsRow[]>>
}

/**
 * 创建匿名统计加载控制器
 *
 * @param adapter - 统计接口适配器
 * @returns 统计加载控制器
 */
export function useAnalytics(adapter: AnalyticsAdapter): AnalyticsController {
  const rows = shallowRef<AnalyticsRow[]>([])
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  /**
   * 加载并校验指定日期区间的统计行
   *
   * @param start - 起始日期
   * @param end - 结束日期
   * @returns 加载完成后的 Promise
   */
  async function load(start: string, end: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const nextRows = await adapter.exportRows(start, end)
      const validation = validateAnalyticsRows(nextRows)
      if (!validation.valid) throw new Error(validation.message)
      rows.value = nextRows
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '统计加载失败'
      rows.value = []
    } finally {
      isLoading.value = false
    }
  }

  return { error: readonly(error), isLoading: readonly(isLoading), load, rows: readonly(rows) }
}
