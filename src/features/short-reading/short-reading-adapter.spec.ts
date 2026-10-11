import { describe, expect, it, vi } from 'vitest'

import { createShortReadingAdapter } from './short-reading-adapter'
import { normalizeShortReading } from './short-reading-model'
describe('independent reading contract', () => {
  it('takes a reading offline using the content version and preserves its retry identity', async () => {
    const request = vi.fn().mockRejectedValue(new Error('response lost'))
    const adapter = createShortReadingAdapter({ request })
    const snapshot = {
      id: 'READING',
      revisionId: 'REV',
      version: 3,
      editVersion: 7,
      seriesId: 'SERIES',
      contentHash: 'a'.repeat(64),
      status: 'PUBLISHED',
      content: normalizeShortReading({}),
      trialEnabled: true,
      trialVersion: 3
    }
    await expect(adapter.offline(snapshot)).rejects.toThrow('response lost')
    await expect(adapter.offline(snapshot)).rejects.toThrow('response lost')
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/admin/content/short-readings/READING/offline',
      body: { expected_version: 3 }
    })
    expect(request.mock.calls[1]?.[0].headers).toEqual(request.mock.calls[0]?.[0].headers)
  })
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

  it('updates global reading order with the content version without editing text snapshots', async () => {
    const request = vi.fn().mockResolvedValue({ content_id: 'READING', version: 4, sort_order: -3 })
    const result = await createShortReadingAdapter({ request }).sort('READING', -3, 3, 'sort-retry')
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/v1/admin/content/short-readings/READING/sort-order',
      headers: { 'Idempotency-Key': 'sort-retry' },
      body: { expected_version: 3, sort_order: -3 }
    })
    expect(result).toEqual({ version: 4, sortOrder: -3 })
  })
})

describe('reading trial version and retry identity', () => {
  it('keeps the same trial key after a lost response', async () => {
    const request = vi.fn().mockRejectedValue(new Error('response lost'))
    const adapter = createShortReadingAdapter({ request })
    await expect(adapter.trial('READING', true, 3)).rejects.toThrow('response lost')
    await expect(adapter.trial('READING', true, 3)).rejects.toThrow('response lost')
    expect(request.mock.calls[0]?.[0].headers).toEqual(request.mock.calls[1]?.[0].headers)
  })
  it('uses the latest content version for check after trial updates the loaded reading', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        draft_revision_id: 'REV',
        version: 3,
        series_id: 'SERIES',
        trial_enabled: false
      })
      .mockResolvedValueOnce({
        content_snapshot: normalizeShortReading({}),
        edit_version: 7,
        status: 'DRAFT'
      })
      .mockResolvedValueOnce({ version: 4 })
      .mockResolvedValueOnce({ ready: true, error_codes: [] })
    const adapter = createShortReadingAdapter({ request })
    await adapter.load('READING')
    await adapter.trial('READING', true, 3)
    expect(await adapter.check('REV')).toMatchObject({ version: 4 })
  })
})
