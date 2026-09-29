import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type { FeedbackAdapter } from './feedback-adapter'

import { useFeedbackNote } from './use-feedback-note'

describe('feedback internal note controller', () => {
  it('preserves the note draft when submission fails', async () => {
    const failure = new ApiError({
      code: 'HTTP_503',
      message: '暂时无法保存',
      requestId: 'request-note',
      status: 503
    })
    const addInternalNote = vi.fn().mockRejectedValue(failure)
    const controller = useFeedbackNote({ addInternalNote } as unknown as FeedbackAdapter, 'FB-1')
    controller.setDraft('需要继续排查')

    await expect(controller.submit()).rejects.toBe(failure)

    expect(controller.draft.value).toBe('需要继续排查')
    expect(controller.error.value).toBe('暂时无法保存')
    expect(controller.apiError.value).toBe(failure)
  })
})
