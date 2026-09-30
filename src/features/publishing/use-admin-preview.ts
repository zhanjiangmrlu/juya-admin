import { readonly, ref, shallowRef, toValue } from 'vue'

import type { AdminPreview, PublishAdapter } from './publish-adapter'
import type { DeepReadonly, MaybeRef, Ref } from 'vue'

export interface AdminPreviewController {
  error: Readonly<Ref<string | null>>
  load(): Promise<void>
  preview: DeepReadonly<Ref<AdminPreview | null>>
  state: Readonly<Ref<'error' | 'idle' | 'loading' | 'success'>>
}

/**
 * 创建管理员草稿预览加载控制器
 *
 * @param adapter - 只读预览适配器
 * @param revisionId - 待预览的内容版本编号
 * @returns 管理员预览控制器
 */
export function useAdminPreview(
  adapter: Pick<PublishAdapter, 'preview'>,
  revisionId: MaybeRef<string>
): AdminPreviewController {
  const preview = shallowRef<AdminPreview | null>(null)
  const error = ref<string | null>(null)
  const state = ref<'error' | 'idle' | 'loading' | 'success'>('idle')

  /** 加载指定版本的管理员预览。 */
  async function load(): Promise<void> {
    state.value = 'loading'
    error.value = null
    preview.value = null
    try {
      preview.value = await adapter.preview(toValue(revisionId))
      state.value = 'success'
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '管理员预览加载失败'
      state.value = 'error'
      throw failure
    }
  }

  return {
    error: readonly(error),
    load,
    preview: readonly(preview),
    state: readonly(state)
  }
}
