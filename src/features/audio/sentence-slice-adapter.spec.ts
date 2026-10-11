import { describe, expect, it, vi } from 'vitest'

import { createSentenceSliceAdapter } from './sentence-slice-adapter'

vi.mock('@/shared/contracts/contract-capabilities', () => ({ hasAdminOperation: () => true }))
const hash = 'a'.repeat(64)
const revision = {
  id: 'REV',
  version: 3,
  edit_version: 3,
  scene_id: 'SCENE',
  stable_entry_ids: [],
  stable_sentence_ids: ['SENTENCE'],
  content: {
    dialogue: [{ id: 'SENTENCE', english: 'Hello', chinese: '你好', start_ms: 0, end_ms: 500 }],
    audio: { version_id: 'SOURCE', asset_id: 'WHOLE', duration_ms: 1000 }
  }
}
const state = {
  revision_id: 'REV',
  sentence_id: 'SENTENCE',
  edit_version: 3,
  dependency_hash: hash,
  status: 'READY_TO_LISTEN',
  target_id: 'TARGET',
  resource_version: 'SLICE',
  asset_id: 'ASSET',
  duration_ms: 500,
  listening_confirmed: false
}

describe('durable slice state restoration', () => {
  it('restores an unconfirmed file in a fresh adapter without a component hash cache', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce({ ...state, url: '/fixed-slice', status: 'READY' })
    const [slice] = await createSentenceSliceAdapter({ request }).list('REV')
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      method: 'GET',
      path: '/api/v1/admin/content/revisions/REV/sentences/SENTENCE/slice-state',
      query: { expected_version: 3 }
    })
    expect(slice).toMatchObject({
      dependencyHash: hash,
      resourceVersion: 'SLICE',
      url: '/fixed-slice',
      confirmed: false
    })
  })
  it('does not fetch a playable URL for a pending safety review', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce({ ...state, status: 'REVIEW_PENDING' })
    const [slice] = await createSentenceSliceAdapter({ request }).list('REV')
    expect(slice?.status).toBe('REVIEW_PENDING')
    expect(slice?.url).toBeUndefined()
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('rejects a preview resource that changed since the state read', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(revision)
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce({ ...state, resource_version: 'OTHER', url: '/other' })
    await expect(createSentenceSliceAdapter({ request }).list('REV')).rejects.toThrow('切片')
  })
})
