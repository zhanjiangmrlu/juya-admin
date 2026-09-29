import { computed, readonly, ref, shallowRef } from 'vue'

import { useIdempotentCommand } from '@/shared/commands/idempotent-command'
import { ApiError } from '@/shared/errors/api-error'

import type { FeedbackAdapter, FeedbackInternalNote } from './feedback-adapter'
import type { Ref } from 'vue'

export interface FeedbackNoteController {
  apiError: Readonly<Ref<ApiError | null>>
  draft: Readonly<Ref<string>>
  error: Readonly<Ref<string | null>>
  isSubmitting: Readonly<Ref<boolean>>
  setDraft(value: string): void
  submit(): Promise<FeedbackInternalNote>
}

/**
 * 管理仅管理员可见的内部备注草稿与幂等提交。
 * @param adapter - 反馈接口适配器
 * @param ticketId - 当前反馈编号
 * @returns 内部备注控制器
 */
export function useFeedbackNote(
  adapter: FeedbackAdapter,
  ticketId: string
): FeedbackNoteController {
  const draft = ref('')
  const error = ref<string | null>(null)
  const apiError = shallowRef<ApiError | null>(null)
  const command = useIdempotentCommand<string, FeedbackInternalNote>((content, key) =>
    adapter.addInternalNote(ticketId, content, key)
  )

  /**
   * 更新本地备注草稿。
   * @param value - 管理员输入的备注内容
   */
  function setDraft(value: string): void {
    draft.value = value
    error.value = null
    apiError.value = null
  }

  /**
   * 校验并幂等提交当前备注草稿。
   * @returns 服务端创建的内部备注
   */
  async function submit(): Promise<FeedbackInternalNote> {
    const content = draft.value.trim()
    if (!content || content.length > 200) {
      error.value = content ? '内部备注最多 200 字' : '内部备注不能为空'
      apiError.value = null
      throw new Error(error.value)
    }
    try {
      const note = await command.submit(content)
      draft.value = ''
      error.value = null
      apiError.value = null
      command.reset()
      return note
    } catch (failure) {
      apiError.value = failure instanceof ApiError ? failure : null
      error.value = failure instanceof ApiError ? failure.message : '内部备注保存失败'
      throw failure
    }
  }

  return {
    apiError: readonly(apiError),
    draft: readonly(draft),
    error: readonly(error),
    isSubmitting: readonly(computed(() => command.state.value === 'submitting')),
    setDraft,
    submit
  }
}
