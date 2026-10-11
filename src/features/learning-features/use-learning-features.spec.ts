import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import { useLearningFeatures } from './use-learning-features'

describe('recording permission', () => {
  it('preserves the loaded recording permission when only the secondary profile entry changes', async () => {
    const save = vi.fn(async () => ({
      recordingEnabled: true,
      profileCompletionEnabled: true,
      version: 4
    }))
    const controller = useLearningFeatures({
      load: vi.fn(async () => ({
        recordingEnabled: true,
        profileCompletionEnabled: false,
        version: 3
      })),
      save
    })
    await controller.load()
    controller.profileEnabled.value = true
    await controller.save()
    expect(save).toHaveBeenCalledWith(true, true, 3, expect.any(String))
    expect(controller.enabled.value).toBe(true)
    expect(controller.profileEnabled.value).toBe(true)
  })
  it('requires a real snapshot and preserves false with initial version zero', async () => {
    const save = vi.fn(async () => ({
      recordingEnabled: true,
      profileCompletionEnabled: true,
      version: 1
    }))
    const controller = useLearningFeatures({
      load: vi.fn(async () => ({
        recordingEnabled: false,
        profileCompletionEnabled: true,
        version: 0
      })),
      save
    })
    await controller.save()
    expect(save).not.toHaveBeenCalled()
    await controller.load()
    expect(controller.enabled.value).toBe(false)
    controller.enabled.value = true
    await controller.save()
    expect(save).toHaveBeenCalledWith(true, true, 0, expect.any(String))
    expect(controller.snapshot.value?.version).toBe(1)
  })

  it('retains the exact command key after transport failure and resets on changed input', async () => {
    const save = vi.fn().mockRejectedValue(new Error('response lost'))
    const controller = useLearningFeatures({
      load: vi.fn(async () => ({
        recordingEnabled: false,
        profileCompletionEnabled: true,
        version: 2
      })),
      save
    })
    await controller.load()
    controller.enabled.value = true
    await controller.save()
    await controller.save()
    expect(save.mock.calls[0]?.[3]).toBe(save.mock.calls[1]?.[3])
    controller.enabled.value = false
    await controller.save()
    expect(save.mock.calls[2]?.[3]).not.toBe(save.mock.calls[0]?.[3])
  })

  it('keeps local intent on 409 and requires explicitly loading the latest version', async () => {
    const save = vi.fn().mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFIG_VERSION_CONFLICT',
        message: '配置已变化',
        requestId: 'test'
      })
    )
    const controller = useLearningFeatures({
      load: vi.fn(async () => ({
        recordingEnabled: false,
        profileCompletionEnabled: true,
        version: 1
      })),
      save
    })
    await controller.load()
    controller.enabled.value = true
    await controller.save()
    expect(controller.enabled.value).toBe(true)
    expect(controller.conflict.value).toBe(true)
    await controller.save()
    expect(save).toHaveBeenCalledTimes(1)
    await controller.load()
    expect(controller.conflict.value).toBe(false)
    expect(controller.enabled.value).toBe(false)
  })

  it('ignores a delayed snapshot after leaving the page', async () => {
    let resolve!: (value: {
      recordingEnabled: boolean
      profileCompletionEnabled: boolean
      version: number
    }) => void
    const controller = useLearningFeatures({
      load: () =>
        new Promise((done) => {
          resolve = done
        }),
      save: vi.fn()
    })
    const loading = controller.load()
    controller.dispose()
    resolve({ recordingEnabled: true, profileCompletionEnabled: true, version: 3 })
    await loading
    expect(controller.snapshot.value).toBeNull()
    expect(controller.enabled.value).toBe(false)
  })
})
