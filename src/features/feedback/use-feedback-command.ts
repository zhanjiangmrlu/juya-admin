import { readonly, ref, shallowRef } from 'vue'

import { useIdempotentCommand } from '@/shared/commands/idempotent-command'
import { ApiError } from '@/shared/errors/api-error'

import type { FeedbackAdapter, FeedbackCommandInput, FeedbackTicket } from './feedback-adapter'
import type { Ref } from 'vue'

export interface ResolveFeedbackInput {
  note: string
  template: string
}

export class FeedbackClientError extends Error {
  readonly code = 'CLIENT_VALIDATION_ERROR'
}

export interface FeedbackCommandController {
  close(reason: string): Promise<void>
  error: Readonly<Ref<string | null>>
  hasConflict: Readonly<Ref<boolean>>
  lastInput: Readonly<Ref<FeedbackCommandInput | null>>
  requestSupplement(requestText: string): Promise<void>
  resolve(input: ResolveFeedbackInput): Promise<void>
  start(): Promise<void>
}

/**
 * 创建反馈处理命令控制器
 *
 * @param adapter - 反馈接口适配器
 * @param ticket - 当前可写反馈详情引用
 * @returns 反馈命令控制器
 */
export function useFeedbackCommand(
  adapter: FeedbackAdapter,
  ticket: Ref<FeedbackTicket | null>
): FeedbackCommandController {
  const error = ref<string | null>(null)
  const hasConflict = ref(false)
  const lastInput = shallowRef<FeedbackCommandInput | null>(null)
  const command = useIdempotentCommand<FeedbackCommandInput, FeedbackTicket>(adapter.execute)

  /**
   * 校验并执行反馈命令，成功后重新读取详情
   *
   * @param input - 反馈命令输入
   * @returns 命令与详情刷新完成后的 Promise
   */
  async function run(input: FeedbackCommandInput): Promise<void> {
    lastInput.value = input
    error.value = null
    hasConflict.value = false
    try {
      await command.submit(input)
      ticket.value = await adapter.getDetail(input.ticketId)
    } catch (failure) {
      hasConflict.value = failure instanceof ApiError && failure.status === 409
      error.value = failure instanceof Error ? failure.message : '反馈操作失败'
      throw failure
    }
  }

  /**
   * 开始处理当前反馈
   *
   * @returns 命令完成后的 Promise
   */
  async function start(): Promise<void> {
    await run(requireTicketCommand('START'))
  }

  /**
   * 请求用户补充信息，最多允许两轮
   *
   * @param requestText - 发给用户的补充要求
   * @returns 命令完成后的 Promise
   */
  async function requestSupplement(requestText: string): Promise<void> {
    if ((ticket.value?.supplementRounds ?? 2) >= 2) throw validationError('最多只能要求补充两轮')
    if (!requestText.trim()) throw validationError('补充要求不能为空')
    await run({
      ...requireTicketCommand('REQUEST_SUPPLEMENT'),
      payload: { request_text: requestText.trim() }
    })
  }

  /**
   * 使用必选模板和最多 200 字说明解决反馈
   *
   * @param input - 回复模板和补充说明
   * @returns 命令完成后的 Promise
   */
  async function resolve(input: ResolveFeedbackInput): Promise<void> {
    if (!['RESOLVED', 'TEMPORARILY_UNAVAILABLE'].includes(input.template))
      throw validationError('请选择回复模板')
    if (input.note.length > 200) throw validationError('补充说明最多 200 字')
    await run({
      ...requireTicketCommand('RESOLVE'),
      payload: { note: input.note, template: input.template }
    })
  }

  /**
   * 以信息不足原因关闭反馈
   *
   * @param reason - 关闭原因
   * @returns 命令完成后的 Promise
   */
  async function close(reason: string): Promise<void> {
    if (!reason.trim()) throw validationError('关闭原因不能为空')
    await run({ ...requireTicketCommand('CLOSE'), payload: { reason: reason.trim() } })
  }

  /**
   * 构造绑定当前反馈编号的命令
   *
   * @param type - 命令类型
   * @returns 含反馈编号的命令输入
   */
  function requireTicketCommand(type: FeedbackCommandInput['type']): FeedbackCommandInput {
    if (!ticket.value) throw validationError('反馈详情尚未加载')
    return { ticketId: ticket.value.id, type }
  }

  return {
    close,
    error: readonly(error),
    hasConflict: readonly(hasConflict),
    lastInput: readonly(lastInput),
    requestSupplement,
    resolve,
    start
  }
}

/**
 * 创建客户端校验错误
 *
 * @param message - 面向管理员的校验文案
 * @returns 带稳定错误码的客户端错误
 */
function validationError(message: string): FeedbackClientError {
  return new FeedbackClientError(message)
}
