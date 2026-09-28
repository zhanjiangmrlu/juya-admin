import { computed, readonly, ref, shallowRef } from 'vue'

import { useIdempotentCommand } from '@/shared/commands/idempotent-command'
import { ApiError } from '@/shared/errors/api-error'

import type {
  FormalEntitlement,
  FormalEntitlementAdapter,
  FormalEntitlementPayload
} from './formal-entitlement-adapter'
import type { FormalEntitlementOperation } from './formal-entitlement-model'
import type { DeepReadonly, Ref } from 'vue'

export interface FormalEntitlementDraft extends FormalEntitlementPayload {
  operation: FormalEntitlementOperation
}

export interface FormalEntitlementCommandController {
  canConfirm: Readonly<Ref<boolean>>
  commandState: Readonly<Ref<'error' | 'idle' | 'submitting' | 'success'>>
  draft: DeepReadonly<Ref<FormalEntitlementDraft | null>>
  errorMessage: Readonly<Ref<string | null>>
  hasConflict: Readonly<Ref<boolean>>
  preview(): Promise<FormalEntitlement>
  previewResult: DeepReadonly<Ref<FormalEntitlement | null>>
  refreshPreview(): Promise<FormalEntitlement>
  setDraft(nextDraft: FormalEntitlementDraft): void
  submit(reason: string): Promise<FormalEntitlement>
}

/**
 * 创建正式权益预览、确认和幂等提交控制器。
 *
 * @param adapter - 正式权益接口适配器。
 * @returns 正式权益命令控制器。
 */
export function useFormalEntitlementCommand(
  adapter: FormalEntitlementAdapter
): FormalEntitlementCommandController {
  const draft = shallowRef<FormalEntitlementDraft | null>(null)
  const previewResult = shallowRef<FormalEntitlement | null>(null)
  const errorMessage = ref<string | null>(null)
  const hasConflict = ref(false)
  const command = useIdempotentCommand<FormalEntitlementDraft, FormalEntitlement>(
    async (input, idempotencyKey) =>
      adapter.execute(input.operation, toPayload(input), idempotencyKey)
  )
  const canConfirm = computed(() => draft.value !== null && previewResult.value !== null)

  /**
   * 替换当前表单输入并使旧预览失效。
   *
   * @param nextDraft - 最新的完整正式权益表单。
   * @returns 无返回值。
   */
  function setDraft(nextDraft: FormalEntitlementDraft): void {
    draft.value = { ...nextDraft }
    previewResult.value = null
    errorMessage.value = null
    hasConflict.value = false
    command.reset(nextDraft)
  }

  /**
   * 请求服务端计算正式权益操作结果。
   *
   * @returns 服务端返回的预览权益。
   */
  async function preview(): Promise<FormalEntitlement> {
    if (draft.value === null) throw new Error('请先填写正式权益操作信息')
    errorMessage.value = null
    hasConflict.value = false
    try {
      const result = await adapter.preview(draft.value.operation, toPayload(draft.value))
      previewResult.value = result
      return result
    } catch (reason) {
      previewResult.value = null
      errorMessage.value = toErrorMessage(reason, '权益预览失败，请检查输入后重试')
      throw reason
    }
  }

  /**
   * 在状态冲突后使用原表单重新获取服务端预览。
   *
   * @returns 刷新后的服务端预览权益。
   */
  async function refreshPreview(): Promise<FormalEntitlement> {
    return preview()
  }

  /**
   * 使用确认原因提交正式权益命令。
   *
   * @param reason - 管理员在二次确认中填写的审计原因。
   * @returns 服务端持久化后的正式权益。
   */
  async function submit(reason: string): Promise<FormalEntitlement> {
    if (!canConfirm.value || draft.value === null) throw new Error('请先完成服务端预览')
    errorMessage.value = null
    hasConflict.value = false
    try {
      return await command.submit({ ...draft.value, reason })
    } catch (failure) {
      hasConflict.value = failure instanceof ApiError && failure.status === 409
      errorMessage.value = toErrorMessage(failure, '正式权益操作失败，请稍后重试')
      throw failure
    }
  }

  return {
    canConfirm: readonly(canConfirm),
    commandState: command.state,
    draft: readonly(draft),
    errorMessage: readonly(errorMessage),
    hasConflict: readonly(hasConflict),
    preview,
    previewResult: readonly(previewResult),
    refreshPreview,
    setDraft,
    submit
  }
}

/**
 * 去除命令操作字段并构造接口负载。
 *
 * @param draft - 完整正式权益命令草稿。
 * @returns 正式权益接口负载。
 */
function toPayload(draft: FormalEntitlementDraft): FormalEntitlementPayload {
  return {
    packageId: draft.packageId,
    reason: draft.reason,
    term: draft.term,
    userId: draft.userId
  }
}

/**
 * 将未知异常映射为可展示的安全错误文案。
 *
 * @param failure - 捕获的未知异常。
 * @param fallback - 非接口异常时使用的兜底文案。
 * @returns 可展示的错误文案。
 */
function toErrorMessage(failure: unknown, fallback: string): string {
  return failure instanceof ApiError ? failure.message : fallback
}
