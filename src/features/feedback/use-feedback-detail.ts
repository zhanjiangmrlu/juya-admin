import { readonly, ref, shallowRef, toValue } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type { FeedbackAdapter, FeedbackTicket } from './feedback-adapter'
import type { MaybeRef, Ref } from 'vue'

export interface FeedbackDetailController {
  dispose(): void
  error: Readonly<Ref<string | null>>
  isLoading: Readonly<Ref<boolean>>
  load(): Promise<void>
  ticket: Readonly<Ref<FeedbackTicket | null>>
}

/**
 * 创建反馈详情加载控制器
 *
 * @param adapter - 反馈接口适配器
 * @param ticketId - 反馈编号或响应式反馈编号
 * @returns 反馈详情控制器
 */
export function useFeedbackDetail(
  adapter: FeedbackAdapter,
  ticketId: MaybeRef<string>
): FeedbackDetailController {
  const ticket = shallowRef<FeedbackTicket | null>(null)
  const error = ref<string | null>(null)
  const isLoading = ref(false)
  let controller: AbortController | null = null

  /**
   * 加载当前反馈详情
   *
   * @returns 加载完成后的 Promise
   */
  async function load(): Promise<void> {
    controller?.abort()
    controller = new AbortController()
    isLoading.value = true
    error.value = null
    try {
      ticket.value = await adapter.getDetail(toValue(ticketId), controller.signal)
    } catch (failure) {
      if (!controller.signal.aborted)
        error.value = failure instanceof ApiError ? failure.message : '反馈详情加载失败'
    } finally {
      if (!controller.signal.aborted) isLoading.value = false
    }
  }

  /**
   * 取消尚未结束的详情请求
   *
   * @returns 无返回值
   */
  function dispose(): void {
    controller?.abort()
    controller = null
  }

  return {
    dispose,
    error: readonly(error),
    isLoading: readonly(isLoading),
    load,
    ticket: readonly(ticket)
  }
}
