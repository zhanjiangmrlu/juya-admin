import { readonly, ref, shallowRef } from 'vue'

import { useIdempotentCommand } from '@/shared/commands/idempotent-command'
import { ApiError } from '@/shared/errors/api-error'

import type {
  LimitedEntitlement,
  LimitedEntitlementAdapter,
  LimitedEntitlementCommandInput
} from './limited-entitlement-adapter'
import type { DeepReadonly, Ref } from 'vue'

export interface LimitedEntitlementCommandController {
  commandState: Readonly<Ref<'error' | 'idle' | 'submitting' | 'success'>>
  disabledReason: Readonly<Ref<string | null>>
  draft: DeepReadonly<Ref<LimitedEntitlementCommandInput | null>>
  errorMessage: Readonly<Ref<string | null>>
  result: DeepReadonly<Ref<LimitedEntitlement | null>>
  setDraft(draft: LimitedEntitlementCommandInput): void
  submit(reason: string): Promise<LimitedEntitlement>
}

/**
 * 创建限时权益幂等命令控制器
 *
 * @param adapter - 限时权益命令适配器
 * @returns 限时权益命令控制器
 */
export function useLimitedEntitlementCommand(
  adapter: LimitedEntitlementAdapter
): LimitedEntitlementCommandController {
  const draft = shallowRef<LimitedEntitlementCommandInput | null>(null)
  const result = shallowRef<LimitedEntitlement | null>(null)
  const errorMessage = ref<string | null>(null)
  const disabledReason = ref<string | null>(null)
  const command = useIdempotentCommand<LimitedEntitlementCommandInput, LimitedEntitlement>(
    adapter.execute
  )

  /**
   * 替换命令输入并生成新的幂等键
   *
   * @param nextDraft - 最新限时权益命令输入
   * @returns 无返回值
   */
  function setDraft(nextDraft: LimitedEntitlementCommandInput): void {
    draft.value = { ...nextDraft }
    result.value = null
    errorMessage.value = null
    disabledReason.value = null
    command.reset(nextDraft)
  }

  /**
   * 使用管理员原因提交当前限时权益命令
   *
   * @param reason - 二次确认中填写的审计原因
   * @returns 服务端持久化后的限时权益
   */
  async function submit(reason: string): Promise<LimitedEntitlement> {
    if (draft.value === null) throw new Error('请先填写限时权益操作信息')
    errorMessage.value = null
    disabledReason.value = null
    try {
      const nextResult = await command.submit({ ...draft.value, reason })
      result.value = nextResult
      return nextResult
    } catch (failure) {
      errorMessage.value =
        failure instanceof ApiError ? failure.message : '限时权益操作失败，请稍后重试'
      disabledReason.value = mapDisabledReason(failure)
      throw failure
    }
  }

  return {
    commandState: command.state,
    disabledReason: readonly(disabledReason),
    draft: readonly(draft),
    errorMessage: readonly(errorMessage),
    result: readonly(result),
    setDraft,
    submit
  }
}

/**
 * 将服务端业务冲突映射为可见的禁用原因
 *
 * @param failure - 捕获到的命令异常
 * @returns 需要阻止继续提交时的原因，否则返回空值
 */
function mapDisabledReason(failure: unknown): string | null {
  if (!(failure instanceof ApiError) || failure.status !== 409) return null
  const reasons: Readonly<Record<string, string>> = {
    CAMPAIGN_CAPACITY_REACHED: '活动容量已满，无法继续开通',
    CAMPAIGN_NOT_OPEN: '活动当前不可开通',
    LIMITED_ACTIVE_CANNOT_EXTEND: '已激活限时权益不能延期或恢复启动窗口',
    LIMITED_REMEDY_ALREADY_USED: '该权益已经使用过一次补救机会',
    USER_NOT_ELIGIBLE: '用户处于注销期或当前不具备开通条件'
  }
  return reasons[failure.code] ?? '权益状态已变化，请刷新核对后重试'
}
