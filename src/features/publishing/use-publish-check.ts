import { computed, readonly, ref, shallowRef, toValue } from 'vue'

import { useIdempotentCommand } from '@/shared/commands/idempotent-command'
import { ApiError } from '@/shared/errors/api-error'

import type { PublishAdapter, PublishCheckResult, PublishInput } from './publish-adapter'
import type { DeepReadonly, MaybeRef, Ref } from 'vue'

export interface PublishCheckController {
  acknowledgedWarningCodes: DeepReadonly<Ref<string[]>>
  applyCheck(result: PublishCheckResult): void
  canPublish: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  hasConflict: Readonly<Ref<boolean>>
  publish(): Promise<void>
  result: DeepReadonly<Ref<PublishCheckResult | null>>
  runCheck(): Promise<void>
  setWarningAcknowledged(code: string, acknowledged: boolean): void
}

/**
 * 创建发布检查与发布闸门控制器
 *
 * @param adapter - 发布接口适配器
 * @param revisionId - 内容版本编号或响应式编号
 * @returns 发布检查控制器
 */
export function usePublishCheck(
  adapter: Pick<PublishAdapter, 'check' | 'publish'>,
  revisionId: MaybeRef<string>
): PublishCheckController {
  const result = shallowRef<PublishCheckResult | null>(null)
  const acknowledgedWarningCodes = ref<string[]>([])
  const error = ref<string | null>(null)
  const hasConflict = ref(false)
  const command = useIdempotentCommand<PublishInput, Record<string, unknown>>(adapter.publish)
  const canPublish = computed(
    () =>
      result.value !== null &&
      result.value.errorCodes.length === 0 &&
      result.value.warningCodes.every((code) => acknowledgedWarningCodes.value.includes(code))
  )

  /**
   * 应用新的服务端检查结果
   *
   * @param nextResult - 发布检查结果
   * @returns 无返回值
   */
  function applyCheck(nextResult: PublishCheckResult): void {
    result.value = nextResult
    acknowledgedWarningCodes.value = acknowledgedWarningCodes.value.filter((code) =>
      nextResult.warningCodes.includes(code)
    )
  }

  /**
   * 设置单条警告的确认状态
   *
   * @param code - 警告码
   * @param acknowledged - 是否确认
   * @returns 无返回值
   */
  function setWarningAcknowledged(code: string, acknowledged: boolean): void {
    const codes = new Set(acknowledgedWarningCodes.value)
    if (acknowledged) codes.add(code)
    else codes.delete(code)
    acknowledgedWarningCodes.value = [...codes]
  }

  /**
   * 请求服务端重新执行发布检查
   *
   * @returns 检查完成后的 Promise
   */
  async function runCheck(): Promise<void> {
    error.value = null
    applyCheck(await adapter.check(toValue(revisionId), acknowledgedWarningCodes.value))
  }

  /**
   * 发布当前已通过闸门的内容版本
   *
   * @returns 发布完成后的 Promise
   */
  async function publish(): Promise<void> {
    if (!canPublish.value) throw new Error('发布检查尚未通过')
    error.value = null
    hasConflict.value = false
    try {
      await command.submit({
        acknowledgedWarningCodes: acknowledgedWarningCodes.value,
        revisionId: toValue(revisionId)
      })
    } catch (failure) {
      hasConflict.value = failure instanceof ApiError && failure.status === 409
      error.value = failure instanceof Error ? failure.message : '发布失败'
      throw failure
    }
  }

  return {
    acknowledgedWarningCodes: readonly(acknowledgedWarningCodes),
    applyCheck,
    canPublish: readonly(canPublish),
    error: readonly(error),
    hasConflict: readonly(hasConflict),
    publish,
    result: readonly(result),
    runCheck,
    setWarningAcknowledged
  }
}
