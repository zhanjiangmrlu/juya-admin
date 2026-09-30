import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import { useAdminPreview } from './use-admin-preview'

describe('admin preview controller', () => {
  it('exposes a retryable error without inventing preview content', async () => {
    const failure = new ApiError({
      code: 'REVISION_NOT_FOUND',
      message: '内容版本不存在',
      requestId: 'request-preview',
      status: 404
    })
    const preview = vi.fn().mockRejectedValue(failure)
    const controller = useAdminPreview({ preview }, 'draft-1')

    await expect(controller.load()).rejects.toBe(failure)

    expect(controller.preview.value).toBeNull()
    expect(controller.error.value).toBe('内容版本不存在')
    expect(controller.state.value).toBe('error')
    expect(preview).toHaveBeenCalledWith('draft-1')
  })
})
