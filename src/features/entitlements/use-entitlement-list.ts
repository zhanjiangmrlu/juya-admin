import { ref, shallowRef } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type {
  EntitlementFilters,
  EntitlementQueryAdapter,
  EntitlementRow,
  Page
} from './entitlement-query-adapter'

/**
 * 统一权益列表的加载、分页和错误恢复状态。
 * @param adapter - 权益查询适配器
 * @returns 权益列表控制器
 */
export function useEntitlementList(adapter: EntitlementQueryAdapter) {
  const page = shallowRef<Page<EntitlementRow>>({ items: [], page: 1, pageSize: 10, total: 0 })
  const state = ref<'idle' | 'loading' | 'empty' | 'error' | 'success'>('idle')
  const error = ref<string | null>(null)
  const apiError = shallowRef<ApiError | null>(null)
  let sequence = 0
  /**
   * 根据筛选条件请求服务端分页。
   * @param filters - 当前筛选与页码
   * @returns 加载完成的 Promise
   */
  async function load(filters: EntitlementFilters): Promise<void> {
    const current = ++sequence
    state.value = 'loading'
    error.value = null
    apiError.value = null
    try {
      const result = await adapter.list(filters)
      if (current !== sequence) return
      page.value = result
      state.value = result.items.length ? 'success' : 'empty'
    } catch (failure) {
      if (current !== sequence) return
      state.value = 'error'
      apiError.value = failure instanceof ApiError ? failure : null
      error.value =
        failure instanceof ApiError ? `${failure.message}，请重试` : '权益列表加载失败，请重试'
    }
  }
  return { page, state, error, apiError, load }
}
