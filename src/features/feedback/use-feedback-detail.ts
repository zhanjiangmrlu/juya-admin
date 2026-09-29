import { readonly, ref, shallowRef, toValue } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type { FeedbackAdapter, FeedbackDetail } from './feedback-adapter'
import type { DeepReadonly, MaybeRef, Ref } from 'vue'

export interface FeedbackDetailController {
  dispose(): void
  error: Readonly<Ref<string | null>>
  isLoading: Readonly<Ref<boolean>>
  load(): Promise<void>
  loadScreenshot(): Promise<void>
  screenshotExpiresAt: Readonly<Ref<string | null>>
  screenshotUrl: Readonly<Ref<string | null>>
  ticket: DeepReadonly<Ref<FeedbackDetail | null>>
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
  const ticket = shallowRef<FeedbackDetail | null>(null)
  const error = ref<string | null>(null)
  const isLoading = ref(false)
  const screenshotUrl = ref<string | null>(null)
  const screenshotExpiresAt = ref<string | null>(null)
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

  /** 每次按需向服务端重新签发截图临时地址，地址只保存在内存。 */
  async function loadScreenshot(): Promise<void> {
    error.value = null
    try {
      const signed = await adapter.getScreenshotUrl(toValue(ticketId))
      screenshotUrl.value = signed.url
      screenshotExpiresAt.value = signed.expiresAt
    } catch (failure) {
      error.value = failure instanceof ApiError ? failure.message : '反馈截图加载失败'
      throw failure
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
    ticket.value = null
    screenshotUrl.value = null
    screenshotExpiresAt.value = null
  }

  return {
    dispose,
    error: readonly(error),
    isLoading: readonly(isLoading),
    load,
    loadScreenshot,
    screenshotExpiresAt: readonly(screenshotExpiresAt),
    screenshotUrl: readonly(screenshotUrl),
    ticket: readonly(ticket)
  }
}
