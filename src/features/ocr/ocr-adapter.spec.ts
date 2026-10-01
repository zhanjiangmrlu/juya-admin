import { describe, expect, it, vi } from 'vitest'

import { createApiClient } from '@/services/api/api-client'

import { createOcrAdapter } from './ocr-adapter'

describe('ocr adapter', () => {
  it('sends the actual vocabulary template without changing the command key', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'job', status: 'PENDING' })
    await createOcrAdapter({ request }).createJob(
      'image',
      'series',
      'scene',
      'revision',
      'key',
      'vocabulary'
    )
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ template_id: 'vocabulary' }),
        idempotencyKey: 'key'
      })
    )
  })
  it('reuses the supplied OCR creation key after a lost response for the same input', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValue({ id: 'JOB-1', status: 'PENDING' })
    const adapter = createOcrAdapter({ request })
    await expect(
      adapter.createJob('ASSET-1', 'SERIES-1', 'SCENE-1', 'REV-1', 'same-ocr-key')
    ).rejects.toThrow('network failure')
    await adapter.createJob('ASSET-1', 'SERIES-1', 'SCENE-1', 'REV-1', 'same-ocr-key')
    expect(request.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
      'same-ocr-key',
      'same-ocr-key'
    ])
  })
  it('sends the required idempotency and CSRF headers when saving settings', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    const adapter = createOcrAdapter(
      createApiClient({ fetchImplementation, getCsrfToken: () => 'csrf-test' })
    )
    await adapter.updateSettings(settingsInput)

    const options = fetchImplementation.mock.calls[0]?.[1] as RequestInit
    const headers = new Headers(options.headers)
    expect(headers.get('X-Idempotency-Key')).toEqual(expect.stringMatching(/^idem-/))
    expect(headers.get('X-CSRF-Token')).toBe('csrf-test')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(String(options.body))).toEqual(settingsInput)
  })

  it('preserves the supplied settings command key across a failed request and retry', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValue({})
    const adapter = createOcrAdapter({ request })
    await expect(adapter.updateSettings(settingsInput, 'settings-retry-key')).rejects.toThrow(
      'network failure'
    )
    await adapter.updateSettings(settingsInput, 'settings-retry-key')

    for (const [options] of request.mock.calls) {
      expect(options).toMatchObject({
        idempotencyKey: 'settings-retry-key',
        method: 'PUT',
        path: '/api/v1/admin/media/ocr/settings',
        body: settingsInput
      })
    }
  })

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

const settingsInput = {
  enabled: true,
  monthly_limit: 0,
  free_quota: 1000,
  paid_disabled: true,
  verify_quota: true
}
