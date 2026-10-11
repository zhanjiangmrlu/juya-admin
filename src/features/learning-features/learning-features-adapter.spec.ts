import { describe, expect, it, vi } from 'vitest'

import { createLearningFeaturesAdapter } from './learning-features-adapter'

describe('learning features authoritative configuration', () => {
  it('reads false and version zero without assuming recording permission', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ recording_enabled: false, profile_completion_enabled: true, version: 0 })
    const result = await createLearningFeaturesAdapter({ request }).load()
    expect(result).toEqual({ recordingEnabled: false, profileCompletionEnabled: true, version: 0 })
    expect(request).toHaveBeenCalledWith({ method: 'GET', path: '/api/v1/admin/learning-features' })
  })
  it('sends a CAS command with the supplied stable Idempotency-Key', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ recording_enabled: true, profile_completion_enabled: true, version: 2 })
    await createLearningFeaturesAdapter({ request }).save(true, true, 1, 'recording-retry')
    expect(request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/api/v1/admin/learning-features',
      headers: { 'Idempotency-Key': 'recording-retry' },
      body: { recording_enabled: true, profile_completion_enabled: true, expected_version: 1 }
    })
  })
  it.each([
    { recording_enabled: 'false', version: 1 },
    { recording_enabled: true, profile_completion_enabled: true, version: -1 },
    { recording_enabled: true, profile_completion_enabled: true, version: 1.5 }
  ])('rejects malformed authority responses %j', async (value) => {
    await expect(
      createLearningFeaturesAdapter({ request: vi.fn().mockResolvedValue(value) }).load()
    ).rejects.toThrow('录音配置响应')
  })
})
