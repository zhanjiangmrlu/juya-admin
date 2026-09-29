import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type { FeedbackAdapter } from './feedback-adapter'

import { useFeedbackCommand } from './use-feedback-command'

describe('feedback command controller', () => {
  it('requires a resolve template and limits notes to 200 characters', async () => {
    const adapter = { execute: vi.fn(), getDetail: vi.fn() } as unknown as FeedbackAdapter
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
    const adapter = { execute: vi.fn(), getDetail: vi.fn() } as unknown as FeedbackAdapter
    const controller = useFeedbackCommand(adapter, ref({ ...ticket, supplementRounds: 2 }))

    await expect(controller.requestSupplement('请补充步骤')).rejects.toMatchObject({
      code: 'CLIENT_VALIDATION_ERROR'
    })
    expect(adapter.execute).not.toHaveBeenCalled()
  })

  it('preserves the last input after a conflict and refreshes detail after success', async () => {
    const conflict = new ApiError({
      code: 'FEEDBACK_STATE_CONFLICT',
      message: '反馈状态已变化',
      requestId: 'request-1',
      status: 409
    })
    const execute = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce(ticket)
    const getDetail = vi.fn().mockResolvedValue({ ...ticket, status: 'NEED_MORE' })
    const ticketRef = ref(ticket)
    const controller = useFeedbackCommand(
      { execute, getDetail } as unknown as FeedbackAdapter,
      ticketRef
    )

    await expect(controller.requestSupplement('请补充操作步骤')).rejects.toBe(conflict)
    expect(controller.hasConflict.value).toBe(true)
    expect(controller.apiError.value).toBe(conflict)
    expect(controller.lastInput.value?.payload).toEqual({ request_text: '请补充操作步骤' })

    await controller.requestSupplement('请补充操作步骤')
    expect(controller.apiError.value).toBeNull()
    expect(getDetail).toHaveBeenCalledWith('FB-1')
    expect(ticketRef.value.status).toBe('NEED_MORE')
  })
})

const ticket = {
  category: 'CONTENT' as const,
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
