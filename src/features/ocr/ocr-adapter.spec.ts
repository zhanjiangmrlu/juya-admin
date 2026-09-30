import { describe, expect, it, vi } from 'vitest'

import { createOcrAdapter } from './ocr-adapter'

describe('ocr adapter', () => {
  it('loads persisted job and candidate and sends idempotent commands', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        batch_id: null,
        business_key: 'ocr:1:key',
        cancel_requested_at: null,
        created_at: '2026-09-30T10:00:00Z',
        created_by: '7',
        error_code: null,
        id: 'JOB-1',
        job_type: 'OCR',
        provider_request_id: 'provider-1',
        status: 'SUCCEEDED',
        target_id: 'ASSET-1',
        updated_at: '2026-09-30T10:01:00Z'
      })
      .mockResolvedValueOnce({
        asset_id: 'ASSET-1',
        confidence: 0.98,
        confirmed_revision_id: null,
        error_code: null,
        id: 'CANDIDATE-1',
        job_id: 'JOB-1',
        status: 'READY',
        structured_candidate: { title: 'Coffee' },
        template_type: 'learning-card'
      })
      .mockResolvedValueOnce({ revision_id: 'REV-2', revision_status: 'DRAFT', version: 2 })
      .mockResolvedValueOnce({ status: 'CANCELLED' })
    const adapter = createOcrAdapter({ request })

    expect((await adapter.getJob('JOB-1')).status).toBe('SUCCEEDED')
    expect((await adapter.getCandidate('JOB-1')).content).toEqual({ title: 'Coffee' })
    expect(await adapter.confirm('JOB-1', 'SCENE-1', { title: 'Reviewed' }, 'confirm-key')).toEqual(
      {
        revisionId: 'REV-2',
        revisionStatus: 'DRAFT',
        version: 2
      }
    )
    await adapter.command('JOB-1', 'cancel', 'cancel-key')

    expect(request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        body: { content: { title: 'Reviewed' }, scene_id: 'SCENE-1' },
        idempotencyKey: 'confirm-key',
        path: '/api/v1/admin/media/ocr/jobs/JOB-1/commands/confirm'
      })
    )
    expect(request).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        body: {},
        idempotencyKey: 'cancel-key',
        path: '/api/v1/admin/media/ocr/jobs/JOB-1/commands/cancel'
      })
    )
  })
})
