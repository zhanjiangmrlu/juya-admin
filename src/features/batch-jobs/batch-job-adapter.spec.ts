import { describe, expect, it, vi } from 'vitest'

import { createBatchJobAdapter } from './batch-job-adapter'

describe('batch job adapter', () => {
  it('loads partial results and executes batch and trash commands', async () => {
    const batch = {
      business_key: 'batch:key',
      cancel_requested_at: null,
      completed_at: null,
      created_at: '2026-09-30T10:00:00Z',
      created_by: '7',
      failure_count: 1,
      id: 'BATCH-1',
      items: [
        {
          attempt_count: 1,
          error_code: null,
          id: 'ITEM-1',
          item_key: '0:SCENE-1',
          processing_job_id: null,
          result_version: 2,
          status: 'SUCCEEDED',
          target_id: 'SCENE-1'
        },
        {
          attempt_count: 1,
          error_code: 'VALIDATION_FAILED',
          id: 'ITEM-2',
          item_key: '1:SCENE-2',
          processing_job_id: null,
          result_version: null,
          status: 'FAILED',
          target_id: 'SCENE-2'
        }
      ],
      job_type: 'VALIDATE',
      status: 'COMPLETED_WITH_ERRORS',
      success_count: 1,
      total_count: 2,
      updated_at: '2026-09-30T10:01:00Z'
    }
    const trash = {
      cleaned_at: null,
      id: 'TRASH-1',
      restored_at: null,
      retention_until: '2026-10-30T10:00:00Z',
      revision_id: 'REV-1',
      scene_id: 'SCENE-1',
      status: 'TRASHED',
      trashed_at: '2026-09-30T10:00:00Z',
      trashed_by: '7'
    }
    const request = vi
      .fn()
      .mockResolvedValueOnce({ items: [batch], page: 1, page_size: 20, total: 1 })
      .mockResolvedValueOnce({ items: [trash] })
      .mockResolvedValueOnce(batch)
      .mockResolvedValueOnce({ ...trash, status: 'RESTORED' })
    const adapter = createBatchJobAdapter({ request })

    const page = await adapter.list(1, 20)
    expect(page.items[0]?.items.map((item) => item.status)).toEqual(['SUCCEEDED', 'FAILED'])
    expect((await adapter.listTrash())[0]?.retentionUntil).toContain('2026-10-30')
    await adapter.command('BATCH-1', 'retry-failed', 'retry-key')
    await adapter.commandTrash('TRASH-1', 'restore', 'restore-key')

    expect(request.mock.calls[2]?.[0]).toMatchObject({
      idempotencyKey: 'retry-key',
      path: '/api/v1/admin/media/batch-jobs/BATCH-1/commands/retry-failed'
    })
    expect(request.mock.calls[3]?.[0]).toMatchObject({
      idempotencyKey: 'restore-key',
      path: '/api/v1/admin/media/trash/TRASH-1/commands/restore'
    })
  })
})
