import { describe, expect, it, vi } from 'vitest'

import { createUploadAdapter } from './upload-adapter'

describe('upload adapter', () => {
  it('confirms the asset then creates one persisted OCR job', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: 'ASSET-1' })
      .mockResolvedValueOnce({ id: 'JOB-1', status: 'PENDING' })
    const adapter = createUploadAdapter({ request })

    await expect(
      adapter.confirm(
        { fields: {}, objectKey: 'uploads/images/7/a.png', url: '' },
        { seriesId: 'SERIES-1', templateId: 'learning-card' },
        'ocr-key'
      )
    ).resolves.toEqual({ assetId: 'ASSET-1', jobId: 'JOB-1' })
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: {
          asset_id: 'ASSET-1',
          object_key: 'uploads/images/7/a.png',
          series_id: 'SERIES-1',
          template_id: 'learning-card'
        },
        idempotencyKey: 'ocr-key',
        path: '/api/v1/admin/media/ocr/jobs'
      })
    )
  })
})
