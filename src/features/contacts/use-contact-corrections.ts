import { type Ref, ref } from 'vue'

import { useIdempotentCommand } from '@/shared/commands/idempotent-command'
import { ApiError } from '@/shared/errors/api-error'

import type {
  ContactCapabilities,
  ContactCorrectionAction,
  ContactCorrectionDto,
  ContactCorrectionStatus,
  CorrectionDecisionDto
} from './contact-capabilities'
import type { CommandState } from '@/shared/commands/idempotent-command'

export type ContactCorrectionPageState = 'empty' | 'error' | 'idle' | 'loading' | 'success'

interface DecisionInput {
  action: ContactCorrectionAction
  id: string
}

export interface ContactCorrectionController {
  commandState: Readonly<Ref<CommandState>>
  decide(id: string, action: ContactCorrectionAction): Promise<void>
  detail: Ref<ContactCorrectionDto | null>
  dispose(): void
  error: Ref<string | null>
  items: Ref<ContactCorrectionDto[]>
  loadDetail(id: string): Promise<void>
  loadList(status?: ContactCorrectionStatus): Promise<void>
  state: Ref<ContactCorrectionPageState>
}

/**
 * 创建联系更正列表、详情和幂等决定控制器
 *
 * @param capabilities - 联系资料接口适配器
 * @returns 联系更正页面控制器
 */
export function useContactCorrections(
  capabilities: ContactCapabilities
): ContactCorrectionController {
  const detail = ref<ContactCorrectionDto | null>(null)
  const error = ref<string | null>(null)
  const items = ref<ContactCorrectionDto[]>([])
  const state = ref<ContactCorrectionPageState>('idle')
  let queryController: AbortController | null = null
  let commandController: AbortController | null = null
  const command = useIdempotentCommand<DecisionInput, CorrectionDecisionDto>(
    async (input, idempotencyKey) => {
      commandController = new AbortController()
      return capabilities.decideCorrection(
        input.id,
        input.action,
        idempotencyKey,
        commandController.signal
      )
    }
  )

  /**
   * 加载可选状态筛选下的更正列表。
   * @param status - 可选申请状态
   */
  async function loadList(status?: ContactCorrectionStatus): Promise<void> {
    queryController?.abort()
    queryController = new AbortController()
    error.value = null
    state.value = 'loading'
    try {
      const page = await capabilities.listCorrections(status, queryController.signal)
      items.value = page.items
      state.value = page.items.length === 0 ? 'empty' : 'success'
    } catch (reason) {
      if (isAbortError(reason)) return
      error.value = reason instanceof ApiError ? reason.message : '联系更正列表加载失败，请稍后重试'
      state.value = 'error'
    }
  }

  /**
   * 加载更正申请详情。
   * @param id - 更正申请编号
   */
  async function loadDetail(id: string): Promise<void> {
    queryController?.abort()
    queryController = new AbortController()
    error.value = null
    state.value = 'loading'
    try {
      detail.value = await capabilities.getCorrection(id, queryController.signal)
      state.value = 'success'
    } catch (reason) {
      if (isAbortError(reason)) return
      error.value = reason instanceof ApiError ? reason.message : '联系更正详情加载失败，请稍后重试'
      state.value = 'error'
    }
  }

  /**
   * 幂等提交决定并在成功后刷新详情。
   * @param id - 更正申请编号
   * @param action - 批准或拒绝动作
   */
  async function decide(id: string, action: ContactCorrectionAction): Promise<void> {
    error.value = null
    try {
      await command.submit({ action, id })
      await loadDetail(id)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        error.value = '申请状态已变化，请刷新后重试'
      } else if (!isAbortError(reason)) {
        error.value = reason instanceof ApiError ? reason.message : '联系更正处理失败，请稍后重试'
      }
      throw reason
    }
  }

  /** 取消请求并清除敏感详情。 */
  function dispose(): void {
    queryController?.abort()
    commandController?.abort()
    detail.value = null
    items.value = []
  }

  return {
    commandState: command.state,
    decide,
    detail,
    dispose,
    error,
    items,
    loadDetail,
    loadList,
    state
  }
}

/**
 * 判断异常是否为请求取消。
 * @param reason - 捕获到的未知异常
 * @returns 是否为 AbortError
 */
function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError'
}
