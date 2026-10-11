import { describe, expect, it } from 'vitest'

import { normalizeSceneContent } from '@/features/content-editor/scene-form'

import { canListenSlice, invalidateSentenceSlice, validSliceBoundary } from './sentence-slice-model'

describe('actual sentence slices', () => {
  it('requires an actual ready file tied to matching source and boundaries', () => {
    const row = normalizeSceneContent({
      dialogue: [{ id: 's1', start_ms: 100, end_ms: 500, audio_version_id: 'whole-v1' }]
    }).dialogue[0]!
    const slice = {
      sentenceId: 's1',
      sourceVersion: 'whole-v1',
      startMs: 100,
      endMs: 500,
      status: 'READY',
      targetId: 'target',
      resourceVersion: 'slice-v1',
      assetId: 'file',
      durationMs: 400,
      confirmed: false
    }
    expect(canListenSlice(row, slice, 'whole-v1')).toBe(true)
    expect(canListenSlice(row, { ...slice, assetId: null }, 'whole-v1')).toBe(false)
    expect(canListenSlice(row, slice, 'whole-v2')).toBe(false)
    expect(canListenSlice({ ...row, start_ms: 110 }, slice, 'whole-v1')).toBe(false)
  })
  it('invalidates actual slice binding and listening confirmation on a changed boundary', () => {
    const row = normalizeSceneContent({
      dialogue: [
        {
          id: 's1',
          timing_confirmed: true,
          slice_target_id: 'target',
          slice_version: 'v1',
          slice_dependency_hash: 'hash'
        }
      ]
    }).dialogue[0]!
    invalidateSentenceSlice(row)
    expect(row).toMatchObject({
      timing_confirmed: false,
      slice_target_id: null,
      slice_version: null,
      slice_dependency_hash: null
    })
  })
  it('accepts only finite integer boundaries inside decoded actual duration', () => {
    expect(validSliceBoundary(0, 1000, 1000)).toBe(true)
    for (const [start, end, duration] of [
      [0, 1001, 1000],
      [-1, 500, 1000],
      [500, 500, 1000],
      [0.5, 500, 1000],
      [0, 500, 0]
    ])
      expect(validSliceBoundary(start!, end!, duration!)).toBe(false)
  })
})
