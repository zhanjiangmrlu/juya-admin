import { describe, expect, it } from 'vitest'

import { mapImportBatchOverview } from './import-batch-overview-model'

describe('import batch overview', () => {
  it('keeps imported drafts separate from published results and counts affected articles once', () => {
    const batch = mapImportBatchOverview({
      batch_id: 'IMPORT-1',
      status: 'PREVIEW_READY',
      items: [
        {
          item_id: '1',
          status: 'SUCCESS',
          candidate: { title_en: 'Draft' },
          issues: [],
          result: { content_id: 'SCENE-1', revision_id: 'REV-1' }
        },
        {
          item_id: '2',
          status: 'PENDING',
          candidate: { title_en: 'Needs review' },
          issues: [
            { severity: 'ERROR', code: 'MISSING_TEXT', field: 'translation' },
            { severity: 'CONFIRM', code: 'CHECK_IMAGE' }
          ]
        },
        {
          item_id: '3',
          status: 'FAILED',
          candidate: { title_en: 'Failed' },
          issues: [],
          result: { error_code: 'AUDIO_FAILED' }
        }
      ]
    })
    expect(batch.counts).toMatchObject({
      total: 3,
      normal: 1,
      proofreading: 1,
      failed: 1,
      published: 0,
      publishable: null
    })
    expect(batch.problems).toHaveLength(3)
    expect(batch.problems[0]).toMatchObject({ title: 'Needs review', location: 'translation' })
    expect(batch.usage).toBeNull()
  })

  it('does not invent result metrics when parsing has not finished', () => {
    expect(mapImportBatchOverview({ batch_id: 'NEW', status: 'UPLOADED' }).counts).toMatchObject({
      total: null,
      normal: null,
      failed: null
    })
  })
})
