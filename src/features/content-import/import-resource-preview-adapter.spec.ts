import { describe, expect, it, vi } from 'vitest'

import { createImportResourcePreviewAdapter } from './import-resource-preview-adapter'

describe('controlled import resource preview', () => {
  it('loads material paths through the authenticated material preview alias', async () => {
    const request = vi.fn().mockResolvedValue({
      url: '/api/fixed-preview?token=private',
      content_type: 'image/png',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      sha256: 'a'.repeat(64)
    })
    await createImportResourcePreviewAdapter({ request }, 'materials').preview(
      'MATERIAL',
      'images/word.png'
    )
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/v1/admin/content-materials/MATERIAL/resources/preview',
        body: { path: 'images/word.png' }
      })
    )
  })
  it('requests an exact archive path and preserves the short-lived administrator preview', async () => {
    const expires = new Date(Date.now() + 60_000).toISOString()
    const request = vi.fn().mockResolvedValue({
      url: '/api/fixed-preview?token=private',
      content_type: 'image/png',
      expires_at: expires,
      sha256: 'a'.repeat(64)
    })
    const preview = await createImportResourcePreviewAdapter({ request }).preview(
      'BATCH',
      'images/my-word.png'
    )
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/v1/admin/content-imports/BATCH/resources/preview',
      body: { path: 'images/my-word.png' },
      signal: undefined
    })
    expect(preview.contentType).toBe('image/png')
    expect(preview.expiresAt).toBe(expires)
  })
  it('rejects an already expired resource instead of showing it as usable', async () => {
    const request = vi.fn().mockResolvedValue({
      url: '/expired',
      content_type: 'audio/mpeg',
      expires_at: '2000-01-01T00:00:00Z',
      sha256: 'a'.repeat(64)
    })
    await expect(
      createImportResourcePreviewAdapter({ request }).preview('BATCH', 'audio/full.mp3')
    ).rejects.toThrow('素材预览')
  })
})
