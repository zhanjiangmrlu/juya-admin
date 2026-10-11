import { describe, expect, it, vi } from 'vitest'

import { createShortReadingAdapter } from './short-reading-adapter'
import { normalizeShortReading } from './short-reading-model'
describe('independent reading contract', () => {
  it('uses both optimistic versions and retains the caller retry key', async () => {
    const content = normalizeShortReading({ title_en: 'Reading' })
    const request = vi
      .fn()
      .mockResolvedValueOnce({ version: 4 })
      .mockResolvedValueOnce({
        public_id: 'READING',
        draft_revision_id: 'REV',
        version: 4,
        series_id: 'SERIES'
      })
      .mockResolvedValueOnce({
        content_snapshot: content,
        edit_version: 8,
        content_hash: 'a'.repeat(64),
        status: 'DRAFT'
      })
    const snapshot = {
      id: 'READING',
      revisionId: 'REV',
      version: 3,
      editVersion: 7,
      seriesId: 'SERIES',
      contentHash: 'a'.repeat(64),
      status: 'DRAFT',
      content,
      trialEnabled: null,
      trialVersion: 3
    }
    const result = await createShortReadingAdapter({ request }).save(
      snapshot,
      content,
      'save-fixed'
    )
    expect(request.mock.calls[0]?.[0]).toEqual({
      method: 'PUT',
      path: '/api/v1/admin/content/short-readings/READING/revisions/REV',
      headers: { 'Idempotency-Key': 'save-fixed' },
      body: { expected_version: 3, expected_edit_version: 7, content }
    })
    expect(result.version).toBe(4)
    expect(result.editVersion).toBe(8)
    expect(result.trialEnabled).toBe(null)
  })
})
