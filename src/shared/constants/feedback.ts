import type { FeedbackCategory, FeedbackStatus } from '@/shared/types/feedback'

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  needs_info: '待补充',
  resolved: '已处理'
}
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  content: '内容问题',
  pronunciation: '发音问题',
  display: '显示问题',
  function: '功能问题'
}
export const FEEDBACK_OPERATION_PREFIX = 'juya-feedback-reply:'
