import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { FeedbackAdapter } from './feedback-adapter'

import { useFeedbackCommand } from './use-feedback-command'

describe('feedback command controller', () => {
  it('requires a resolve template and limits notes to 200 characters', async () => {
    const adapter: FeedbackAdapter = { execute: vi.fn(), getDetail: vi.fn() }
    const controller = useFeedbackCommand(adapter, ref(ticket))

    await expect(controller.resolve({ note: '说明', template: '' })).rejects.toMatchObject({
      code: 'CLIENT_VALIDATION_ERROR'
    })
    await expect(
      controller.resolve({ note: 'a'.repeat(201), template: 'RESOLVED' })
    ).rejects.toMatchObject({ code: 'CLIENT_VALIDATION_ERROR' })
    expect(adapter.execute).not.toHaveBeenCalled()
  })

  it('rejects a third supplement request without sending a request', async () => {
    const adapter: FeedbackAdapter = { execute: vi.fn(), getDetail: vi.fn() }
    const controller = useFeedbackCommand(adapter, ref({ ...ticket, supplementRounds: 2 }))

    await expect(controller.requestSupplement('请补充步骤')).rejects.toMatchObject({
      code: 'CLIENT_VALIDATION_ERROR'
    })
    expect(adapter.execute).not.toHaveBeenCalled()
  })
})

const ticket = {
  category: 'CONTENT',
  closedAt: null,
  createdAt: '2026-09-29T08:00:00Z',
  deadlineAt: '2026-09-30T08:00:00Z',
  description: '内容问题',
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
