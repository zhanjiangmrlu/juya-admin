import { describe, expect, it, vi } from 'vitest'

import { createAudioAdapter } from './audio-adapter'

describe('audio adapter', () => {
  it('maps target versions and keeps every write idempotent', async () => {
    const target = {
      active_version_id: 'VERSION-1',
      id: 'TARGET-1',
      stable_key: 'SENTENCE-1',
      target_type: 'SENTENCE'
    }
    const version = {
      asset_id: 'ASSET-1',
      created_at: '2026-09-30T10:00:00Z',
      created_by: '7',
      id: 'VERSION-1',
      processing_job_id: null,
      provider_request_id: null,
      source: 'MANUAL',
      status: 'ACTIVE',
      target_id: 'TARGET-1',
      version_no: 1
    }
    const request = vi
      .fn()
      .mockResolvedValueOnce({ items: [target] })
      .mockResolvedValueOnce({ items: [version] })
      .mockResolvedValueOnce(version)
      .mockResolvedValueOnce({ ...target, active_version_id: 'VERSION-2' })
      .mockResolvedValueOnce({ ...target, active_version_id: 'VERSION-1' })
    const adapter = createAudioAdapter({ request })

    expect((await adapter.listTargets('SCENE-1'))[0]?.stableKey).toBe('SENTENCE-1')
    expect((await adapter.listVersions('TARGET-1'))[0]?.source).toBe('MANUAL')
    await adapter.uploadVersion('TARGET-1', 'ASSET-1', 'upload-key')
    await adapter.confirmVersion('VERSION-2', 'confirm-key')
    await adapter.rollback('TARGET-1', 'VERSION-1', 'rollback-key')

    for (const [index, key] of ['upload-key', 'confirm-key', 'rollback-key'].entries()) {
      expect(request.mock.calls[index + 2]?.[0]).toMatchObject({ idempotencyKey: key })
    }
  })

  it('uploads an audio object before creating the manual version', async () => {
    const version = {
      asset_id: 'ASSET-2',
      created_at: '2026-09-30T10:00:00Z',
      created_by: '7',
      id: 'VERSION-2',
      processing_job_id: null,
      provider_request_id: null,
      source: 'MANUAL',
      status: 'CANDIDATE',
      target_id: 'TARGET-1',
      version_no: 2
    }
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        fields: { key: 'uploads/audio/7/${filename}' },
        upload_url: 'https://upload.test'
      })
      .mockResolvedValueOnce({ id: 'ASSET-2' })
      .mockResolvedValueOnce(version)
    const upload = vi.fn(async () => undefined)
    const adapter = createAudioAdapter(
      { request },
      { hash: vi.fn(async () => 'a'.repeat(64)), uploader: { upload } }
    )
    const file = new File(['audio'], 'line.mp3', { type: 'audio/mpeg' })

    await adapter.uploadFile('TARGET-1', file, 'audio-key', vi.fn(), new AbortController().signal)

    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ file, url: 'https://upload.test' })
    )
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ idempotencyKey: 'audio-key' })
    )
  })
})
