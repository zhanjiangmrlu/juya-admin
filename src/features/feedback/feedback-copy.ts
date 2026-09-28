import type { FeedbackOperation, FeedbackStatus } from './feedback-model'

export const FEEDBACK_STATUS_LABELS: Readonly<Record<FeedbackStatus, string>> = {
  CLOSED_INSUFFICIENT: '信息不足已关闭',
  NEED_MORE: '等待用户补充',
  PENDING: '待处理',
  PROCESSING: '处理中',
  RESOLVED: '已解决',
  USER_SUPPLIED: '用户已补充'
}

export const FEEDBACK_OPERATION_LABELS: Readonly<Record<FeedbackOperation, string>> = {
  CLOSE: '信息不足关闭',
  REQUEST_SUPPLEMENT: '要求补充',
  RESOLVE: '回复并解决',
  START: '开始处理'
}
