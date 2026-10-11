import { describe, expect, it, vi } from 'vitest'

import { createContentMaterialsAdapter } from './content-materials-adapter'

describe('explicit independent material bindings', () => {
  it('uploads a separate ZIP without using a guessed unified-import mode', async () => {
    const request = vi.fn().mockResolvedValue({ batch_id: 'material' })
    await createContentMaterialsAdapter({ request }).upload(
      new File(['zip'], 'words.zip'),
      'SERIES-1',
      'word_card',
      'same-key'
    )
    const options = request.mock.calls[0]?.[0]
    expect(options.path).toBe('/api/v1/admin/content-materials')
    expect(options.headers).toEqual({ 'Idempotency-Key': 'same-key' })
    expect(options.body.get('content_type')).toBe('word_card')
    expect(options.body.get('mode')).toBe(null)
  })
  it('submits only manually selected files with fixed draft and stable entry identities', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'PENDING' })
    await createContentMaterialsAdapter({ request }).bind(
      'batch',
      'rev',
      4,
      [{ path: 'word.png', role: 'WORD_IMAGE', entry_id: 'ENTRY-1' }],
      'key'
    )
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/v1/admin/content-materials/batch/bindings',
      headers: { 'Idempotency-Key': 'key' },
      body: {
        revision_id: 'rev',
        expected_version: 4,
        manual_checked: true,
        bindings: [{ path: 'word.png', role: 'WORD_IMAGE', entry_id: 'ENTRY-1' }]
      }
    })
  })
})
