import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type { FeedbackAdapter } from './feedback-adapter'

import { useFeedbackList } from './use-feedback-list'

describe('feedback list controller', () => {
  it('keeps the latest paginated result and exposes load errors', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 2, pageSize: 20, total: 21 })
    const controller = useFeedbackList({ list } as unknown as FeedbackAdapter)

    await controller.load({ keyword: 'FB-1', page: 2 })

    expect(list).toHaveBeenCalledWith({ keyword: 'FB-1', page: 2 }, expect.any(AbortSignal))
    expect(controller.page.value).toEqual({ items: [], page: 2, pageSize: 20, total: 21 })
    expect(controller.error.value).toBeNull()
  })

  it('retains the structured API error for field, rate-limit and request-id details', async () => {
    const failure = new ApiError({
      code: 'HTTP_503',
      message: '服务暂时不可用',
      requestId: 'request-list-503',
      status: 503
    })
    const controller = useFeedbackList({
      list: vi.fn().mockRejectedValue(failure)
    } as unknown as FeedbackAdapter)

    await controller.load({ page: 1 })

    expect(controller.apiError.value).toBe(failure)
    expect(controller.error.value).toBe('服务暂时不可用')
  })
})
