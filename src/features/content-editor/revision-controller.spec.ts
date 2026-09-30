import { describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import { createRevisionController } from './revision-controller'

describe('revision controller', () => {
  it('stops autosave after the remote revision changes', () => {
    const controller = createRevisionController(3)
    controller.observeRemoteRevision(4)
    expect(controller.canAutosave.value).toBe(false)
    expect(controller.conflict.value).toBe(true)
  })

  it('preserves the local draft and exposes the server version after a save conflict', () => {
    const controller = createRevisionController(3, { title: 'Local edit' })
    const conflict = new ApiError({
      code: 'REVISION_VERSION_CONFLICT',
      details: { current_revision_id: 'draft-1', current_version: 4 },
      message: '内容草稿已变化',
      requestId: 'request-409',
      status: 409
    })

    controller.handleSaveFailure(conflict)

    expect(controller.draft.value).toEqual({ title: 'Local edit' })
    expect(controller.remoteVersion.value).toBe(4)
    expect(controller.conflict.value).toBe(true)
    expect(controller.canAutosave.value).toBe(false)
  })
})
