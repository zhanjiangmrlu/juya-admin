import { describe, expect, it, vi } from 'vitest'

import {
  audioProductionFailureLabel,
  candidateBelongsToRevision,
  createContentCandidateAdapter,
  validCandidateSelection
} from './content-candidate-adapter'

describe('human reviewed production candidates', () => {
  it.each([
    ['CANDIDATE_PROVIDER_UNAVAILABLE', '未配置'],
    ['CLOUD_BUDGET_EXHAUSTED', '已用尽'],
    ['AUTO_AUDIO_INPUT_CHANGED', '正文或整段音频已变化']
  ])('explains the real automatic production failure %s', (code, guidance) => {
    expect(audioProductionFailureLabel(code)).toContain(guidance)
  })
  it('restores only a verified revision and never overrides a mismatching server origin', () => {
    expect(candidateBelongsToRevision({ revision_id: 'REV' }, 'REV')).toBe(true)
    expect(candidateBelongsToRevision({ revision_id: 'OTHER' }, 'REV', 'REV')).toBe(false)
    expect(candidateBelongsToRevision({}, 'REV')).toBe(false)
    expect(candidateBelongsToRevision({}, 'REV', 'REV')).toBe(true)
  })
  it('uses Unicode code point offsets and requires an exact source occurrence', () => {
    const row = { source_id: 'sentence', english: 'hello', chinese: '你好', start: 2, end: 7 }
    expect(validCandidateSelection(row, { sentence: '😀 hello hello' })).toBe(true)
    expect(
      validCandidateSelection({ ...row, start: 1, end: 6 }, { sentence: '😀 hello hello' })
    ).toBe(false)
    expect(validCandidateSelection({ ...row, chinese: ' ' }, { sentence: '😀 hello hello' })).toBe(
      false
    )
  })

  it('queues only the requested candidate kind and saved version', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ candidate_id: 'task', stage_id: 'task', status: 'ACCEPTED' })
    await createContentCandidateAdapter({ request }).queue('rev/1', 4, 'ASR_BOUNDARY')
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/v1/admin/content/revisions/rev%2F1/candidates',
      body: { kind: 'ASR_BOUNDARY', expected_version: 4 }
    })
  })

  it('adopts explicit source bounds and Chinese without fabricating confirmation', async () => {
    const request = vi.fn().mockResolvedValue({})
    await createContentCandidateAdapter({ request }).adopt(
      'task',
      3,
      { source_id: 'sentence', english: 'hello', chinese: '你好', start: 2, end: 7 },
      4,
      'PHRASE'
    )
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/v1/admin/content/candidates/task/adoptions',
      body: {
        index: 3,
        source_id: 'sentence',
        chinese: '你好',
        start: 2,
        end: 7,
        expected_version: 4,
        entry_type: 'PHRASE'
      }
    })
    expect(JSON.stringify(request.mock.calls)).not.toContain('confirmed')
  })
})
