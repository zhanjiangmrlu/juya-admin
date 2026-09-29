import { describe, expect, it, vi } from 'vitest'

import type { ApiClient } from '@/services/api/api-client'

import { createFeedbackAdapter } from './feedback-adapter'

describe('feedback adapter', () => {
  it('maps paginated filters and aggregate detail through the generated contract boundary', async () => {
    const request = vi
      .fn<ApiClient['request']>()
      .mockResolvedValueOnce({
        items: [
          {
            category: 'CONTENT',
            created_at: '2026-09-29T08:00:00Z',
            deadline_at: '2026-09-30T08:00:00Z',
            description: '<b>原样内容</b>',
            id: 'FB-1',
            sla_state: 'ON_TRACK',
            status: 'PROCESSING',
            supplement_rounds: 1,
            updated_at: '2026-09-29T09:00:00Z',
            user_id: 'USER-1'
          }
        ],
        page: 2,
        page_size: 20,
        total: 23
      })
      .mockResolvedValueOnce(detailResponse)
    const adapter = createFeedbackAdapter({ request } as ApiClient)

    const page = await adapter.list({
      category: 'CONTENT',
      keyword: 'USER-1',
      page: 2,
      pageSize: 20,
      sla: 'ON_TRACK',
      status: 'PROCESSING'
    })
    const detail = await adapter.getDetail('FB-1')

    expect(request.mock.calls[0]?.[0]).toEqual({
      method: 'GET',
      path: '/api/v1/admin/feedback',
      query: {
        category: 'CONTENT',
        keyword: 'USER-1',
        page: 2,
        page_size: 20,
        sla: 'ON_TRACK',
        status: 'PROCESSING'
      }
    })
    expect(page.items[0]).toMatchObject({
      description: '<b>原样内容</b>',
      id: 'FB-1',
      slaState: 'ON_TRACK'
    })
    expect(detail.timeline.map((item) => item.eventType)).toEqual(['CREATED', 'PROCESSING_STARTED'])
    expect(detail.screenshots).toHaveLength(1)
    expect(detail.internalNotes[0]?.content).toBe('排查记录')
  })

  it('requests fresh screenshot URLs and writes internal notes without browser persistence', async () => {
    const request = vi
      .fn<ApiClient['request']>()
      .mockResolvedValueOnce({
        expires_at: '2026-09-29T08:05:00Z',
        url: 'https://signed.example/one'
      })
      .mockResolvedValueOnce({
        admin_id: '7',
        content: '内部记录',
        created_at: '2026-09-29T08:00:00Z',
        id: 'NOTE-1'
      })
    const adapter = createFeedbackAdapter({ request } as ApiClient)

    await expect(adapter.getScreenshotUrl('FB-1')).resolves.toEqual({
      expiresAt: '2026-09-29T08:05:00Z',
      url: 'https://signed.example/one'
    })
    await expect(adapter.addInternalNote('FB-1', '内部记录', 'idem-note')).resolves.toMatchObject({
      content: '内部记录',
      id: 'NOTE-1'
    })
    expect(request.mock.calls[0]?.[0]).toEqual({
      method: 'POST',
      path: '/api/v1/admin/feedback/FB-1/screenshot-url'
    })
    expect(request.mock.calls[1]?.[0]).toEqual({
      body: { content: '内部记录' },
      idempotencyKey: 'idem-note',
      method: 'POST',
      path: '/api/v1/admin/feedback/FB-1/internal-notes'
    })
  })
})

const detailResponse = {
  category: 'CONTENT',
  closed_at: null,
  created_at: '2026-09-29T08:00:00Z',
  deadline_at: '2026-09-30T08:00:00Z',
  description: '<b>原样内容</b>',
  id: 'FB-1',
  internal_notes: [
    {
      admin_id: '7',
      content: '排查记录',
      created_at: '2026-09-29T08:30:00Z',
      id: 'NOTE-1'
    }
  ],
  reopen_count: 0,
  replies: [],
  resolved_at: null,
  rounds: [],
  screenshots: [{ delete_after: null, deleted_at: null, security_status: 'PASSED' }],
  sla_remaining_seconds: null,
  source: {},
  status: 'PROCESSING',
  supplement_rounds: 1,
  timeline: [
    {
      actor_id: 'USER-1',
      actor_type: 'USER',
      event_type: 'CREATED',
      occurred_at: '2026-09-29T08:00:00Z',
      payload: {},
      visibility: 'BOTH'
    },
    {
      actor_id: '7',
      actor_type: 'ADMIN',
      event_type: 'PROCESSING_STARTED',
      occurred_at: '2026-09-29T08:10:00Z',
      payload: {},
      visibility: 'BOTH'
    }
  ],
  updated_at: '2026-09-29T09:00:00Z',
  user_id: 'USER-1'
}
