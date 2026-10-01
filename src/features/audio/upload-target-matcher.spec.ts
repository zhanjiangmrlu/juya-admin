import { describe, expect, it } from 'vitest'

import { matchAudioTarget } from './upload-target-matcher'

describe('stable per-file target matching', () => {
  const targets = [
    { id: 't1', stableKey: 'sentence-a', targetType: 'scene', activeVersionId: null },
    { id: 't2', stableKey: 'word-b', targetType: 'vocabulary', activeVersionId: null }
  ]
  it('matches exact stable keys and target IDs while leaving unknown files unassigned', () => {
    expect(matchAudioTarget('sentence-a.wav', targets)).toBe('t1')
    expect(matchAudioTarget('t2.mp3', targets)).toBe('t2')
    expect(matchAudioTarget('unknown.wav', targets)).toBeNull()
    expect(matchAudioTarget('sentence.wav', targets)).toBeNull()
  })
  it('does not silently select an ambiguous target', () => {
    expect(
      matchAudioTarget('word-b.wav', [...targets, { ...targets[0]!, stableKey: 'word-b' }])
    ).toBeNull()
  })
})
