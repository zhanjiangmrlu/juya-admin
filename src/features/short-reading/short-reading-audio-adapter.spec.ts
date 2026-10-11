import { describe, expect, it, vi } from 'vitest'

import { createShortReadingAudioAdapter } from './short-reading-audio-adapter'
import { normalizeShortReading } from './short-reading-model'

const snapshot = {
  id: 'READING',
  revisionId: 'REV',
  version: 3,
  editVersion: 7,
  contentHash: 'hash',
  seriesId: 'SERIES',
  status: 'DRAFT',
  content: normalizeShortReading({}),
  trialEnabled: null,
  trialVersion: 3
}
const target = { id: 'FULL-TARGET', content_id: 'READING', revision_id: 'REV', target_type: 'FULL' }
const version = {
  id: 'AUDIO-VERSION',
  assetId: 'ASSET',
  targetId: 'FULL-TARGET',
  status: 'READY',
  versionNo: 1,
  source: 'MANUAL',
  createdAt: ''
}

describe('reading draft FULL audio upload', () => {
  it('binds only the fixed draft FULL target with both versions and separate retry keys', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({
        audio: { version_id: 'AUDIO-VERSION' },
        version: 4,
        edit_version: 8
      })
    const uploadFile = vi.fn(async () => version)
    const adapter = createShortReadingAudioAdapter({ request }, { uploadFile })
    await adapter.upload(snapshot, new File(['sound'], 'reading.mp3'), 'upload')
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/admin/content/short-readings/READING/revisions/REV/audio-upload-target',
      headers: { 'Idempotency-Key': 'upload:target' },
      body: { expected_version: 3, expected_edit_version: 7 }
    })
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      path: '/api/v1/admin/content/short-readings/READING/revisions/REV/audio-upload-target/bind',
      headers: { 'Idempotency-Key': 'upload:bind' },
      body: {
        expected_version: 3,
        expected_edit_version: 7,
        target_id: 'FULL-TARGET',
        asset_id: 'ASSET'
      }
    })
  })
  it('does not re-upload a successful file when the bind response was lost', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(target)
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({ version: 4 })
    const uploadFile = vi.fn(async () => version)
    const adapter = createShortReadingAudioAdapter({ request }, { uploadFile })
    const file = new File(['sound'], 'reading.mp3')
    await expect(adapter.upload(snapshot, file, 'same')).rejects.toThrow('response lost')
    await adapter.upload(snapshot, file, 'same')
    expect(uploadFile).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[3]?.[0]).toMatchObject({
      headers: request.mock.calls[1]?.[0].headers,
      body: request.mock.calls[1]?.[0].body
    })
  })
  it('rejects a response bound to another content or role before uploading', async () => {
    const request = vi.fn().mockResolvedValue({ ...target, revision_id: 'OTHER' })
    const uploadFile = vi.fn()
    await expect(
      createShortReadingAudioAdapter({ request }, { uploadFile }).upload(
        snapshot,
        new File(['sound'], 'reading.mp3'),
        'bad'
      )
    ).rejects.toThrow('上传目标')
    expect(uploadFile).not.toHaveBeenCalled()
  })
})
