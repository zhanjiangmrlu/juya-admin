import { describe, expect, it, vi } from 'vitest'

import { createContentAdapter } from './content-adapter'

describe('content adapter', () => {
  it('maps scene pages and editor requests through the generated contract paths', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(scenePage)
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce({ ...revision, content: { title: 'Saved' }, version: 4 })
    const adapter = createContentAdapter({ request })

    const page = await adapter.listScenes({
      page: 1,
      pageSize: 20,
      query: 'coffee',
      seriesId: 'series-1',
      status: 'PUBLISHED'
    })
    const loaded = await adapter.getRevision('draft-1')
    const saved = await adapter.saveRevision('draft-1', 3, { title: 'Saved' })

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
      body: { content: { title: 'Saved' }, expected_version: 3 },
      method: 'PUT',
      path: '/api/v1/admin/content/revisions/draft-1'
    })
  })
})

const revision = {
  content: { title: 'Local draft' },
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
