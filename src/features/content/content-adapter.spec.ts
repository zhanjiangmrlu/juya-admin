import { describe, expect, it, vi } from 'vitest'

import { createLexiconRow, normalizeSceneContent } from '@/features/content-editor/scene-form'

import { createContentAdapter } from './content-adapter'

describe('content adapter', () => {
  it('reuses caller creation keys and creates distinct defaults for independent actions', async () => {
    const request = vi.fn().mockResolvedValue(scenePage.items[0])
    const adapter = createContentAdapter({ request })
    await adapter.createSeries('Title', 'slug', 'series-retry')
    await adapter.createSeries('Title', 'slug', 'series-retry')
    await adapter.createScene('series-1', 'dialogue', 'scene-retry')
    await adapter.createScene('series-1', 'dialogue', 'scene-retry')
    await adapter.createScene('series-1', 'dialogue')
    await adapter.createScene('series-1', 'dialogue')
    expect(request.mock.calls.slice(0, 4).map(([call]) => call.idempotencyKey)).toEqual([
      'series-retry',
      'series-retry',
      'scene-retry',
      'scene-retry'
    ])
    expect(request.mock.calls[4]?.[0].idempotencyKey).toBeTruthy()
    expect(request.mock.calls[4]?.[0].idempotencyKey).not.toBe(
      request.mock.calls[5]?.[0].idempotencyKey
    )
  })
  it('adopts only selected OCR fields into the current draft with its version', async () => {
    const request = vi.fn().mockResolvedValue({ ...revision, version: 4 })
    const content = normalizeSceneContent({})
    content.title_en = 'OCR title'
    const result = await createContentAdapter({ request }).adoptOcr(
      'draft-1',
      'job-1',
      3,
      ['title_en'],
      content
    )
    expect(result.id).toBe('draft-1')
    expect(result.version).toBe(4)
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/v1/admin/content/revisions/draft-1/ocr-adoptions',
      body: { job_id: 'job-1', expected_version: 3, selected_fields: ['title_en'], content }
    })
  })
  it('strips lexicon response type metadata before reusing fixed entries', async () => {
    const entry = { ...createLexiconRow(), entry_id: 'word-1', entry_version: 7, english: 'coffee' }
    const request = vi.fn().mockResolvedValue({
      items: [
        { ...entry, entry_type: 'VOCABULARY' },
        { ...entry, entry_type: 'PHRASE' }
      ]
    })
    expect(await createContentAdapter({ request }).listLexicon('coffee', 'vocabulary')).toEqual([
      entry
    ])
  })
  it('maps scene pages and editor requests through the generated contract paths', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(scenePage)
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce({ ...revision, content: { title_en: 'Saved' }, version: 4 })
    const adapter = createContentAdapter({ request })

    const page = await adapter.listScenes({
      page: 1,
      pageSize: 20,
      query: 'coffee',
      seriesId: 'series-1',
      status: 'PUBLISHED'
    })
    const loaded = await adapter.getRevision('draft-1')
    const saved = await adapter.saveRevision('draft-1', 3, { title_en: 'Saved' })

    expect(page.items[0]?.draftRevisionId).toBe('draft-1')
    expect(loaded.version).toBe(3)
    expect(saved.version).toBe(4)
    expect(request.mock.calls[0]?.[0]).toEqual({
      method: 'GET',
      path: '/api/v1/admin/content/scenes',
      query: {
        page: 1,
        page_size: 20,
        query: 'coffee',
        series_id: 'series-1',
        status: 'PUBLISHED'
      }
    })
    expect(request.mock.calls[2]?.[0]).toEqual({
      body: { content: { title_en: 'Saved' }, expected_version: 3 },
      method: 'PUT',
      path: '/api/v1/admin/content/revisions/draft-1'
    })
  })
})

const revision = {
  content: { title_en: 'Local draft' },
  created_at: '2026-09-30T10:00:00Z',
  created_by: 'ADMIN-1',
  id: 'draft-1',
  scene_id: 'scene-1',
  source_revision_id: 'published-1',
  stable_entry_ids: [],
  stable_sentence_ids: [],
  status: 'DRAFT',
  version: 3
}

const scenePage = {
  items: [
    {
      cover_object_key: null,
      draft_revision_id: 'draft-1',
      id: 'scene-1',
      published_revision_id: 'published-1',
      series_id: 'series-1',
      series_title: 'Daily English',
      status: 'PUBLISHED',
      summary: 'Coffee order',
      title: 'Ordering coffee',
      updated_at: '2026-09-30T10:00:00Z'
    }
  ],
  page: 1,
  page_size: 20,
  total: 1
}
