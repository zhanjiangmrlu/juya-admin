import { readonly, ref, shallowRef } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type { FeedbackAdapter, FeedbackFilters, FeedbackPage } from './feedback-adapter'
import type { DeepReadonly, Ref } from 'vue'

export interface FeedbackListController {
  apiError: Readonly<Ref<ApiError | null>>
  dispose(): void
  error: Readonly<Ref<string | null>>
  isLoading: Readonly<Ref<boolean>>
  load(filters: FeedbackFilters): Promise<void>
  page: DeepReadonly<Ref<FeedbackPage>>
}

/**
 * 管理反馈列表的分页加载、并发覆盖和错误状态。
 * @param adapter - 反馈接口适配器
 * @returns 反馈列表控制器
 */
export function useFeedbackList(adapter: FeedbackAdapter): FeedbackListController {
  const page = shallowRef<FeedbackPage>({ items: [], page: 1, pageSize: 10, total: 0 })
  const error = ref<string | null>(null)
  const apiError = shallowRef<ApiError | null>(null)
  const isLoading = ref(false)
  let controller: AbortController | null = null
  let sequence = 0

  /**
   * 加载指定筛选条件的反馈分页。
   * @param filters - 当前筛选和分页参数
   * @returns 请求完成后的 Promise
   */
  async function load(filters: FeedbackFilters): Promise<void> {
    controller?.abort()
    controller = new AbortController()
    const current = ++sequence
    isLoading.value = true
    error.value = null
    apiError.value = null
    try {
      const result = await adapter.list(filters, controller.signal)
      if (current === sequence) page.value = result
    } catch (failure) {
      if (current === sequence && !controller.signal.aborted) {
        apiError.value = failure instanceof ApiError ? failure : null
        error.value = failure instanceof ApiError ? failure.message : '反馈列表加载失败'
      }
    } finally {
      if (current === sequence && !controller.signal.aborted) isLoading.value = false
    }
  }

  /** 取消当前请求并释放列表控制器。 */
  function dispose(): void {
    sequence += 1
    controller?.abort()
    controller = null
    isLoading.value = false
  }

  return {
    apiError: readonly(apiError),
    dispose,
    error: readonly(error),
    isLoading: readonly(isLoading),
    load,
    page: readonly(page)
  }
}
