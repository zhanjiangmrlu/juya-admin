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
        structured_candidate: { text: 'Coffee', blocks: [{ text: 'Coffee' }] },
        template_type: 'learning-card'
      })
      .mockResolvedValueOnce({ status: 'CANCELLED' })
    const adapter = createOcrAdapter({ request })

    expect((await adapter.getJob('JOB-1')).status).toBe('SUCCEEDED')
    expect((await adapter.getCandidate('JOB-1')).content).toEqual({
      text: 'Coffee',
      blocks: [{ text: 'Coffee' }]
    })
    await adapter.command('JOB-1', 'cancel', 'cancel-key')

    expect(request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        body: {},
        idempotencyKey: 'cancel-key',
        path: '/api/v1/admin/media/ocr/jobs/JOB-1/commands/cancel'
      })
    )
  })
})
