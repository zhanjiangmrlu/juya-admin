import type { components } from '@/shared/contracts/generated/admin-api'

export type FeedbackDetail = components['schemas']['FeedbackDetail']
export type FeedbackImage = components['schemas']['FeedbackImage']
export type FeedbackEvent = components['schemas']['FeedbackEvent']
export type FeedbackPage = components['schemas']['FeedbackPage']
export type FeedbackUnread = components['schemas']['FeedbackUnread']
export type FeedbackReadReceipt = components['schemas']['FeedbackReadReceipt']
export type FeedbackStatus = FeedbackDetail['status']
export type FeedbackCategory = FeedbackDetail['category']
export interface FeedbackReplyBody {
  text?: string
  status?: Exclude<FeedbackStatus, 'pending'>
  expected_latest_event_id?: number
}
export interface FeedbackMutationPorts {
  owner: () => string | null
  request: <T>(
    path: string,
    options?: { method?: string; body?: unknown; key?: string }
  ) => Promise<T>
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}
