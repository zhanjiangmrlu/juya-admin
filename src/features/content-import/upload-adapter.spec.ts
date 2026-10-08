import { describe, expect, it, vi } from 'vitest'

import { createUploadAdapter } from './upload-adapter'

describe('upload adapter', () => {
  it('reports an existing scene reused by a duplicate image import', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: 'ASSET-1' })
      .mockResolvedValueOnce({ items: [{ id: 'SCENE-OLD' }], reused_scene_ids: ['SCENE-OLD'] })
    const adapter = createUploadAdapter({ request })
    await expect(
      adapter.confirm(
        { fields: {}, objectKey: 'uploads/a.png', url: '' },
        { seriesId: 'SERIES-1', templateId: 'dialogue' },
        'duplicate-key'
      )
    ).resolves.toMatchObject({ sceneId: 'SCENE-OLD', reusedScene: true })
  })

  it('confirms the asset without creating an automatic OCR job', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ id: 'ASSET-1' })
      .mockResolvedValueOnce({ items: [{ id: 'SCENE-1' }] })
    const adapter = createUploadAdapter({ request })

    await expect(
      adapter.confirm(
        { fields: {}, objectKey: 'uploads/images/7/a.png', url: '' },
        { seriesId: 'SERIES-1', templateId: 'learning-card' },
        'ocr-key'
      )
    ).resolves.toEqual({ assetId: 'ASSET-1', jobId: null, sceneId: 'SCENE-1' })
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: '/api/v1/admin/content/imports',
        idempotencyKey: 'ocr-key',
        body: { asset_ids: ['ASSET-1'], series_id: 'SERIES-1', template_type: 'dialogue' }
      })
    )
  })
})
