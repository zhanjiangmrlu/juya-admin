import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type { PublicationRangeAdapter } from './publication-range-adapter'

import { usePublicationRange } from './use-publication-range'

const candidate = {
  content_type: 'short_reading' as const,
  content_id: 'READING',
  revision_id: 'REV',
  candidate_hash: 'a'.repeat(64),
  expected_version: 3,
  expected_edit_version: 7,
  warning_codes: []
}
const range = {
  token: 'RANGE',
  version: 1,
  collection_hash: 'b'.repeat(64),
  candidates: [candidate],
  status: 'PREVIEW',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  results: { items: {} }
}
const factory = () => ({
  prepare: vi.fn(),
  preview: vi.fn(async () => range),
  load: vi.fn(async () => range),
  confirm: vi.fn<PublicationRangeAdapter['confirm']>(async () => undefined)
})

describe('explicit publication range', () => {
  it('requires an explicit selection and manual confirmation, preserves key after lost response', async () => {
    const adapter = factory()
    adapter.confirm.mockRejectedValue(new Error('response lost'))
    const controller = usePublicationRange(adapter)
    await controller.freeze([candidate])
    expect(controller.canConfirm.value).toBe(false)
    controller.selected.value = ['REV']
    expect(controller.canConfirm.value).toBe(false)
    controller.acknowledged.value = true
    await controller.confirm()
    await controller.confirm()
    expect(adapter.confirm).toHaveBeenCalledWith(range, ['REV'], expect.any(String))
    expect(adapter.confirm.mock.calls[0]?.[2]).toBe(adapter.confirm.mock.calls[1]?.[2])
  })
  it('keeps successful results out of retry selection and rejects out-of-range candidates', async () => {
    const adapter = factory()
    adapter.load.mockResolvedValue({
      ...range,
      status: 'PARTIAL',
      candidates: [candidate, { ...candidate, revision_id: 'FAILED' }],
      results: { items: { REV: { status: 'SUCCEEDED' }, FAILED: { status: 'FAILED' } } }
    })
    const controller = usePublicationRange(adapter)
    await controller.restore('RANGE')
    controller.acknowledged.value = true
    controller.selected.value = ['REV']
    expect(controller.canConfirm.value).toBe(false)
    controller.selected.value = ['OTHER']
    expect(controller.canConfirm.value).toBe(false)
    controller.selected.value = ['FAILED']
    expect(controller.canConfirm.value).toBe(true)
  })
  it('invalidates confirmation on a stale preview but retains explicit selection', async () => {
    const adapter = factory()
    adapter.confirm.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'PUBLICATION_PREVIEW_STALE',
        message: '范围已变化',
        requestId: 'test'
      })
    )
    const controller = usePublicationRange(adapter)
    await controller.freeze([candidate])
    controller.selected.value = ['REV']
    controller.acknowledged.value = true
    await controller.confirm()
    expect(controller.stale.value).toBe(true)
    expect(controller.selected.value).toEqual(['REV'])
    expect(controller.canConfirm.value).toBe(false)
  })
})
