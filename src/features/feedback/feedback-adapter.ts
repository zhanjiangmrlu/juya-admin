import type { FeedbackStatus } from './feedback-model'
import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

type FeedbackDetailDto = components['schemas']['FeedbackAdminDetailResponse']
type FeedbackListItemDto = components['schemas']['FeedbackListItemResponse']
type FeedbackNoteDto = components['schemas']['FeedbackInternalNoteResponse']
type FeedbackPageDto = Omit<components['schemas']['FeedbackPageResponse'], 'items'> & {
  items: (FeedbackListItemDto & {
    title?: string
    source?: Record<string, unknown>
    screenshot_status?: string
    supplied_at?: string | null
  })[]
}
type FeedbackTicketDto = components['schemas']['FeedbackTicketResponse']
type SignedScreenshotDto = components['schemas']['SignedFeedbackScreenshotResponse']

export type FeedbackCategory = FeedbackDetailDto['category']
export type FeedbackSlaState = FeedbackListItemDto['sla_state'] | 'URGENT'

export interface FeedbackTicket {
  category: FeedbackCategory
  closedAt: string | null
  createdAt: string
  deadlineAt: string | null
  description: string
  id: string
  reopenCount: number
  resolvedAt: string | null
  slaRemainingSeconds: number | null
  source: Readonly<Record<string, unknown>>
  status: FeedbackStatus
  supplementRounds: number
  updatedAt: string
  userId: string
}

export interface FeedbackListItem {
  title?: string
  source?: Readonly<Record<string, unknown>>
  screenshotStatus?: string
  suppliedAt?: string | null
  category: FeedbackCategory
  createdAt: string
  deadlineAt: string | null
  description: string
  id: string
  slaState: FeedbackSlaState
  status: FeedbackStatus
  supplementRounds: number
  updatedAt: string
  userId: string
}

export interface FeedbackTimelineEvent {
  actorId: string
  actorName?: string | null
  actorType: string
  eventType: string
  occurredAt: string
  payload: Readonly<Record<string, unknown>>
  visibility: string
}

export interface FeedbackScreenshot {
  deleteAfter: string | null
  deletedAt: string | null
  securityStatus: string
}

export interface FeedbackRound {
  pausedAt: string | null
  requestText: string | null
  roundNumber: number
  suppliedAt: string | null
  supplementText: string | null
}

export interface FeedbackReply {
  adminId: string
  note: string | null
  sentAt: string
  template: string
}

export interface FeedbackInternalNote {
  adminId: string
  content: string
  createdAt: string
  id: string
}

export interface FeedbackDetail extends FeedbackTicket {
  internalNotes: readonly FeedbackInternalNote[]
  replies: readonly FeedbackReply[]
  rounds: readonly FeedbackRound[]
  screenshots: readonly FeedbackScreenshot[]
  timeline: readonly FeedbackTimelineEvent[]
}

export interface FeedbackFilters {
  category?: FeedbackCategory
  keyword?: string
  page?: number
  pageSize?: number
  sla?: FeedbackSlaState
  status?: FeedbackStatus
}

export interface FeedbackPage {
  items: readonly FeedbackListItem[]
  page: number
  pageSize: number
  total: number
}

export interface SignedFeedbackScreenshot {
  expiresAt: string
  url: string
}

export type FeedbackCommandType = 'CLOSE' | 'REQUEST_SUPPLEMENT' | 'RESOLVE' | 'START'

export interface FeedbackCommandInput {
  payload?: Readonly<Record<string, unknown>>
  ticketId: string
  type: FeedbackCommandType
}

export interface FeedbackAdapter {
  addInternalNote(
    ticketId: string,
    content: string,
    idempotencyKey: string
  ): Promise<FeedbackInternalNote>
  execute(input: FeedbackCommandInput, idempotencyKey: string): Promise<FeedbackTicket>
  getDetail(ticketId: string, signal?: AbortSignal): Promise<FeedbackDetail>
  getScreenshotUrl(ticketId: string): Promise<SignedFeedbackScreenshot>
  list(filters: FeedbackFilters, signal?: AbortSignal): Promise<FeedbackPage>
}

/**
 * 创建反馈查询、截图、备注和命令接口适配器。
 * @param client - 统一 API 客户端
 * @returns 反馈接口适配器
 */
export function createFeedbackAdapter(client: ApiClient): FeedbackAdapter {
  return {
    async addInternalNote(ticketId, content, idempotencyKey) {
      const response = await client.request<FeedbackNoteDto>({
        body: { content },
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/feedback/${encodeURIComponent(ticketId)}/internal-notes`
      })
      return mapInternalNote(response)
    },
    async execute(input, idempotencyKey) {
      const commandPath =
        input.type === 'CLOSE' ? 'close-insufficient' : input.type.toLowerCase().replace('_', '-')
      const response = await client.request<FeedbackTicketDto>({
        body: input.payload,
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/feedback/${encodeURIComponent(input.ticketId)}/commands/${commandPath}`
      })
      return mapFeedbackTicket(response)
    },
    async getDetail(ticketId, signal) {
      const response = await client.request<FeedbackDetailDto>({
        method: 'GET',
        path: `/api/v1/admin/feedback/${encodeURIComponent(ticketId)}`,
        signal
      })
      return {
        ...mapFeedbackTicket(response),
        internalNotes: response.internal_notes.map(mapInternalNote),
        replies: response.replies.map((reply) => ({
          adminId: reply.admin_id,
          note: reply.note,
          sentAt: reply.sent_at,
          template: reply.template
        })),
        rounds: response.rounds.map((round) => ({
          pausedAt: round.paused_at,
          requestText: round.request_text,
          roundNumber: round.round_number,
          suppliedAt: round.supplied_at,
          supplementText: round.supplement_text
        })),
        screenshots: response.screenshots.map((screenshot) => ({
          deleteAfter: screenshot.delete_after,
          deletedAt: screenshot.deleted_at,
          securityStatus: screenshot.security_status
        })),
        timeline: response.timeline.map((event) => ({
          actorId: event.actor_id,
          actorName: event.actor_name ?? null,
          actorType: event.actor_type,
          eventType: event.event_type,
          occurredAt: event.occurred_at,
          payload: event.payload,
          visibility: event.visibility
        }))
      }
    },
    async getScreenshotUrl(ticketId) {
      const response = await client.request<SignedScreenshotDto>({
        method: 'POST',
        path: `/api/v1/admin/feedback/${encodeURIComponent(ticketId)}/screenshot-url`
      })
      return { expiresAt: response.expires_at, url: response.url }
    },
    async list(filters, signal) {
      const response = await client.request<FeedbackPageDto>({
        method: 'GET',
        path: '/api/v1/admin/feedback',
        query: {
          category: filters.category,
          keyword: filters.keyword,
          page: filters.page,
          page_size: filters.pageSize,
          sla: filters.sla,
          status: filters.status
        },
        signal
      })
      return {
        items: response.items.map((item) => ({
          title: item.title ?? item.description.slice(0, 40),
          source: item.source ?? {},
          screenshotStatus: item.screenshot_status ?? 'NONE',
          suppliedAt: item.supplied_at ?? null,
          category: item.category,
          createdAt: item.created_at,
          deadlineAt: item.deadline_at,
          description: item.description,
          id: item.id,
          slaState: item.sla_state,
          status: item.status,
          supplementRounds: item.supplement_rounds,
          updatedAt: item.updated_at,
          userId: item.user_id
        })),
        page: response.page,
        pageSize: response.page_size,
        total: response.total
      }
    }
  }
}

/**
 * 将生成契约中的反馈工单映射为页面模型。
 * @param source - 反馈工单或聚合详情响应
 * @returns 反馈页面模型
 */
function mapFeedbackTicket(source: FeedbackTicketDto | FeedbackDetailDto): FeedbackTicket {
  return {
    category: source.category,
    closedAt: source.closed_at,
    createdAt: source.created_at,
    deadlineAt: source.deadline_at,
    description: source.description,
    id: source.id,
    reopenCount: source.reopen_count,
    resolvedAt: source.resolved_at,
    slaRemainingSeconds: source.sla_remaining_seconds,
    source: source.source,
    status: source.status,
    supplementRounds: source.supplement_rounds,
    updatedAt: source.updated_at,
    userId: source.user_id
  }
}

/**
 * 映射内部备注响应。
 * @param source - 内部备注接口响应
 * @returns 内部备注页面模型
 */
function mapInternalNote(source: FeedbackNoteDto): FeedbackInternalNote {
  return {
    adminId: source.admin_id,
    content: source.content,
    createdAt: source.created_at,
    id: source.id
  }
}
