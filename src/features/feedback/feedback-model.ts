export type FeedbackStatus =
  'CLOSED_INSUFFICIENT' | 'NEED_MORE' | 'PENDING' | 'PROCESSING' | 'RESOLVED' | 'USER_SUPPLIED'

export type FeedbackOperation = 'CLOSE' | 'REQUEST_SUPPLEMENT' | 'RESOLVE' | 'START'

export interface FeedbackViewModel {
  deadlineAt: string
  status: FeedbackStatus
  supplementRounds: number
}

export interface FeedbackSlaViewModel {
  state: 'due-soon' | 'normal' | 'overdue' | 'paused'
  text: string
}

/**
 * 根据反馈状态与补充轮次返回当前可执行操作
 *
 * @param ticket - 反馈状态、截止时间与补充轮次
 * @returns 当前允许的反馈操作数组
 */
export function getFeedbackOperations(ticket: FeedbackViewModel): readonly FeedbackOperation[] {
  if (ticket.status === 'PENDING') return ['START']
  if (ticket.status === 'USER_SUPPLIED') return ['START', 'RESOLVE', 'CLOSE']
  if (ticket.status === 'PROCESSING') {
    return ticket.supplementRounds < 2
      ? ['REQUEST_SUPPLEMENT', 'RESOLVE', 'CLOSE']
      : ['RESOLVE', 'CLOSE']
  }
  if (ticket.status === 'NEED_MORE') return ['CLOSE']
  return []
}

/**
 * 按反馈状态与服务端截止时间格式化 SLA 展示
 *
 * @param ticket - 反馈状态和服务端截止时间
 * @param now - 用于计算展示的当前时间
 * @returns SLA 状态和说明文案
 */
export function formatFeedbackSla(ticket: FeedbackViewModel, now: Date): FeedbackSlaViewModel {
  if (ticket.status === 'NEED_MORE') return { state: 'paused', text: '等待用户补充' }
  const remainingMilliseconds = new Date(ticket.deadlineAt).getTime() - now.getTime()
  if (remainingMilliseconds <= 0) return { state: 'overdue', text: '已超时' }
  const remainingHours = Math.ceil(remainingMilliseconds / 3_600_000)
  if (remainingHours <= 12) return { state: 'due-soon', text: `剩余 ${remainingHours} 小时` }
  return { state: 'normal', text: `剩余 ${remainingHours} 小时` }
}
