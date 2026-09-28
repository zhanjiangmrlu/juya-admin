import { describe, expect, it } from 'vitest'

import type { FeedbackAdapter } from './feedback-adapter'

import { useFeedbackDetail } from './use-feedback-detail'

describe('feedback detail controller', () => {
  it('loads the real ticket detail by id', async () => {
    const adapter: FeedbackAdapter = {
      execute: async () => ticket,
      getDetail: async () => ticket
    }
    const controller = useFeedbackDetail(adapter, 'FB-1')
    await controller.load()
    expect(controller.ticket.value?.description).toBe('<b>原样文本</b>')
  })
})

const ticket = {
  category: 'CONTENT',
  closedAt: null,
  createdAt: '2026-09-29T08:00:00Z',
  deadlineAt: '2026-09-30T08:00:00Z',
  description: '<b>原样文本</b>',
  id: 'FB-1',
  reopenCount: 0,
  resolvedAt: null,
  slaRemainingSeconds: null,
  source: {},
  status: 'PROCESSING' as const,
  supplementRounds: 0,
  updatedAt: '2026-09-29T09:00:00Z',
  userId: 'USER-1'
}
