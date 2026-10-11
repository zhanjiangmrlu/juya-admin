import { describe, expect, it, vi } from 'vitest'

import { candidateHash, createProofreadingAdapter } from './proofreading-adapter'
describe('fixed proofreading candidates', () => {
  it('hashes the exact candidate independently of object insertion order', async () => {
    expect(await candidateHash({ a: 1, b: '中文' })).toBe(await candidateHash({ b: '中文', a: 1 }))
    expect(await candidateHash({ a: 2, b: '中文' })).not.toBe(
      await candidateHash({ a: 1, b: '中文' })
    )
  })
  it('submits only explicit human checks with the candidate hash', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true })
    await createProofreadingAdapter({ request }).confirm('set', 'rev', 'a'.repeat(64), {
      text_checked: true,
      images_checked: false,
      audio_listened: false
    })
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/v1/admin/content/proofreading/set/items/rev/confirm',
      body: {
        candidate_hash: 'a'.repeat(64),
        text_checked: true,
        images_checked: false,
        audio_listened: false
      }
    })
  })
  it('accepts only the explicit normal selection without claiming manual listening', async () => {
    const request = vi.fn().mockResolvedValue({ confirmed_ids: ['rev'] })
    await createProofreadingAdapter({ request }).bulk('set', 'a'.repeat(64), ['rev'], 'retry-key')
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/v1/admin/content/proofreading/set/normal/bulk-confirm',
      headers: { 'Idempotency-Key': 'retry-key' },
      body: { collection_hash: 'a'.repeat(64), revision_ids: ['rev'], accept_normal_results: true }
    })
  })
  it('confirms only selected modern draft entries with exact edit versions and hashes', async () => {
    const request = vi.fn().mockResolvedValue({})
    await createProofreadingAdapter({ request }).confirmEntries([
      { revision_id: 'rev', expected_version: 3, candidate_hash: 'a'.repeat(64) }
    ])
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/v1/admin/content/revisions/entry-confirmations',
      body: {
        candidates: [{ revision_id: 'rev', expected_version: 3, candidate_hash: 'a'.repeat(64) }],
        manual_checked: true
      }
    })
  })
})
