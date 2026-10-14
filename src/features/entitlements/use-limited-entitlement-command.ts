import { readonly, ref, shallowRef } from 'vue'

import { useIdempotentCommand } from '@/shared/commands/idempotent-command'
import { ApiError } from '@/shared/errors/api-error'

import type {
  LimitedEntitlement,
  LimitedEntitlementAdapter,
  LimitedEntitlementCommandInput,
  LimitedEntitlementPreview
} from './limited-entitlement-adapter'
import type { DeepReadonly, Ref } from 'vue'

export interface LimitedEntitlementCommandController {
  preview(): Promise<LimitedEntitlementPreview>
  previewResult: DeepReadonly<Ref<LimitedEntitlementPreview | null>>
  commandState: Readonly<Ref<'error' | 'idle' | 'submitting' | 'success'>>
  disabledReason: Readonly<Ref<string | null>>
  draft: DeepReadonly<Ref<LimitedEntitlementCommandInput | null>>
  errorMessage: Readonly<Ref<string | null>>
  apiError: Readonly<Ref<ApiError | null>>
  result: DeepReadonly<Ref<LimitedEntitlement | null>>
  setDraft(draft: LimitedEntitlementCommandInput): void
  submit(reason: string): Promise<LimitedEntitlement>
}

export const /**
   * 创建限时权益幂等命令控制器
   *
   * @param adapter - 限时权益命令适配器
   * @returns 限时权益命令控制器
   */
  useLimitedEntitlementCommand = (
    adapter: LimitedEntitlementAdapter
  ): LimitedEntitlementCommandController => {
    const draft = shallowRef<LimitedEntitlementCommandInput | null>(null)
    const result = shallowRef<LimitedEntitlement | null>(null)
    const errorMessage = ref<string | null>(null)
    const apiError = shallowRef<ApiError | null>(null)
    const disabledReason = ref<string | null>(null)
    const previewResult = shallowRef<LimitedEntitlementPreview | null>(null)
    let previewGeneration = 0
    const command = useIdempotentCommand<LimitedEntitlementCommandInput, LimitedEntitlement>(
      adapter.execute
    )

    const /**
       * 仅在输入实质变化时替换命令，保留不确定失败的重试身份
       *
       * @param nextDraft - 最新限时权益命令输入
       * @returns 无返回值
       */
      setDraft = (nextDraft: LimitedEntitlementCommandInput): void => {
        const previous = draft.value
        const sameOperation = Boolean(
          previous &&
          previous.operation === nextDraft.operation &&
          previous.userId === nextDraft.userId &&
          previous.entitlementId === nextDraft.entitlementId &&
          previous.campaignVersionId === nextDraft.campaignVersionId &&
          previous.reason === nextDraft.reason
        )
        if (sameOperation && previous?.expectedVersion === nextDraft.expectedVersion) return
        draft.value = { ...nextDraft }
        previewGeneration++
        previewResult.value = null
        result.value = null
        errorMessage.value = null
        apiError.value = null
        disabledReason.value = null
        // 不确定失败刷新同一对象时保留重试身份,新的服务端预览改变请求才开启新命令
        if (!sameOperation || command.state.value !== 'error') command.reset(nextDraft)
      }

    const /**
       * 使用管理员原因提交当前限时权益命令
       *
       * @param reason - 二次确认中填写的审计原因
       * @returns 服务端持久化后的限时权益
       */
      submit = async (reason: string): Promise<LimitedEntitlement> => {
        if (draft.value === null) throw new Error('请先填写限时权益操作信息')
        if (command.state.value === 'submitting') throw new Error('操作正在提交')
        if (!previewResult.value) throw new Error('请先获取服务端预览')
        errorMessage.value = null
        apiError.value = null
        disabledReason.value = null
        try {
          const nextResult = await command.submit({
            ...draft.value,
            reason: draft.value.operation !== 'GRANT' ? reason : reason.trim() || undefined,
            expectedVersion: previewResult.value?.expectedVersion,
            expectedFingerprint: previewResult.value?.expectedFingerprint
          })
          result.value = nextResult
          return nextResult
        } catch (failure) {
          apiError.value = failure instanceof ApiError ? failure : null
          errorMessage.value =
            failure instanceof ApiError ? failure.message : '限时权益操作失败，请稍后重试'
          disabledReason.value = mapDisabledReason(failure)
          if (failure instanceof ApiError && failure.status === 409) previewResult.value = null
          throw failure
        }
      }

    const /** 请求服务端前后预览并屏蔽过期返回
       * @returns 当前操作结果或完成状态
       */ preview = async (): Promise<LimitedEntitlementPreview> => {
        if (!draft.value || !adapter.preview) throw new Error('当前权益预览能力不可用')
        const generation = ++previewGeneration
        errorMessage.value = null
        try {
          const response = await adapter.preview(draft.value)
          if (generation !== previewGeneration) throw new Error('预览已失效，请重新预览')
          previewResult.value = response
          return response
        } catch (failure) {
          if (generation === previewGeneration) {
            previewResult.value = null
            errorMessage.value = failure instanceof Error ? failure.message : '权益预览失败'
          }
          throw failure
        }
      }

    return {
      preview,
      previewResult: readonly(previewResult),
      commandState: command.state,
      disabledReason: readonly(disabledReason),
      draft: readonly(draft),
      errorMessage: readonly(errorMessage),
      apiError,
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
