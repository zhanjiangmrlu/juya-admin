import { describe, expect, it } from 'vitest'

import { createRevisionController } from './revision-controller'

describe('revision controller', () => {
  it('stops autosave after the remote revision changes', () => {
    const controller = createRevisionController(3)
    controller.observeRemoteRevision(4)
    expect(controller.canAutosave.value).toBe(false)
    expect(controller.conflict.value).toBe(true)
  })
})
