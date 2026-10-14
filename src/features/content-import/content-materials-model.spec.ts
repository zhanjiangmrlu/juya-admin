import { describe, expect, it } from 'vitest'

import { allowedMaterialRoles, materialMode, materialStatistics } from './content-materials-model'

describe('material scope and package identity', () => {
  it('keeps an explicit empty vocabulary package distinct from independent media', () => {
    expect(materialMode({ vocabulary_rows: [], has_vocabulary_table: true }, 'materials')).toBe(
      'vocabulary'
    )
    expect(materialMode({ vocabulary_rows: [] }, 'vocabulary')).toBe('vocabulary')
    expect(materialMode({ vocabulary_rows: [], has_vocabulary_table: false }, 'materials')).toBe(
      'materials'
    )
    expect(materialMode({ vocabulary_rows: [] }, 'materials')).toBe('unknown')
    expect(materialMode({ vocabulary_rows: [{ import_entry_id: 'word' }] }, 'materials')).toBe(
      'vocabulary'
    )
  })

  it('counts complete uploaded resources and keeps missing audio unknown until a fixed draft is read', () => {
    const resources = [
      { path: 'one.mp3', kind: 'audio', matching_candidate_count: 1 },
      { path: 'two.mp3', kind: 'audio', matching_candidate_count: 8, matching_candidates: [] },
      { path: 'three.mp3', kind: 'audio', matching_candidate_count: 0 },
      { path: 'optional.png', kind: 'images', matching_candidate_count: 0 }
    ]
    expect(materialStatistics(resources, 'dialogue', null)).toEqual({
      clearAudio: 1,
      ambiguous: 1,
      missingAudio: null,
      optionalImageErrors: 0
    })
    expect(materialStatistics(resources, 'dialogue', { audio: null })).toMatchObject({
      missingAudio: 1
    })
    expect(materialStatistics(resources, 'short_reading', { audio: null })).toMatchObject({
      missingAudio: 0
    })
    expect(materialStatistics(resources, 'word_card', {})).toMatchObject({ missingAudio: 0 })
    expect(
      materialStatistics(resources, 'dialogue', { audio: { asset_id: 'existing' } })
    ).toMatchObject({ missingAudio: 0 })
    expect(materialStatistics(resources, '', null)).toMatchObject({ optionalImageErrors: null })
  })

  it('never offers vocabulary or chunk bindings on reading and never offers a chunk image', () => {
    expect(
      allowedMaterialRoles(
        ['WORD_IMAGE', 'CHUNK_IMAGE', 'FULL_AUDIO', 'COVER_IMAGE'],
        'short_reading'
      )
    ).toEqual(['FULL_AUDIO', 'COVER_IMAGE'])
    expect(allowedMaterialRoles(['CHUNK_IMAGE', 'WORD_IMAGE', 'WHOLE_AUDIO'], 'word_card')).toEqual(
      ['WORD_IMAGE']
    )
  })
})
