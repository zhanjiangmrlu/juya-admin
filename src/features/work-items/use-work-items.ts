import { computed, readonly, ref } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type { WorkItemAdapter, WorkItemDto } from './work-item-adapter'
import type { Ref } from 'vue'

export interface WorkItemController {
  actionable: Readonly<Ref<readonly WorkItemDto[]>>
  dispose(): void
  error: Readonly<Ref<string | null>>
  informational: Readonly<Ref<readonly WorkItemDto[]>>
  isLoading: Readonly<Ref<boolean>>
  load(): Promise<void>
}

/**
 * 创建待办加载与分组控制器，并保持服务端原始顺序。
 *
 * @param adapter - 待办接口适配器。
 * @returns 待办页面控制器。
 */
export function useWorkItems(adapter: WorkItemAdapter): WorkItemController {
  const items = ref<WorkItemDto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const actionable = computed(() =>
    items.value.filter((item) => item.kind !== 'ACTIVE_ENTITLEMENT_EXPIRING')
  )
  const informational = computed(() =>
    items.value.filter((item) => item.kind === 'ACTIVE_ENTITLEMENT_EXPIRING')
  )
  let controller: AbortController | null = null

  /**
   * 加载最新待办并以服务端顺序保存。
   *
   * @returns 加载完成后的 Promise。
   */
  async function load(): Promise<void> {
    controller?.abort()
    controller = new AbortController()
    isLoading.value = true
    error.value = null
    try {
      items.value = await adapter.getWorkItems(controller.signal)
    } catch (failure) {
      if (controller.signal.aborted) return
      error.value = failure instanceof ApiError ? failure.message : '消息中心加载失败，请稍后重试'
    } finally {
      if (!controller.signal.aborted) isLoading.value = false
    }
  }

  /**
   * 取消页面离开时仍在进行的待办请求。
   *
   * @returns 无返回值。
   */
  function dispose(): void {
    controller?.abort()
    controller = null
  }

  return {
    actionable: readonly(actionable),
    dispose,
    error: readonly(error),
    informational: readonly(informational),
    isLoading: readonly(isLoading),
    load
  }
}
