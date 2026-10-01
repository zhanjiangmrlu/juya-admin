import { describe, expect, it } from 'vitest'

import {
  createDialogueRow,
  createLexiconRow,
  normalizeSceneContent,
  replaceSceneAudio
} from './scene-form'

describe('scene form', () => {
  it('maps cleared optional asset and pronunciation fields to null', () => {
    const form = normalizeSceneContent({
      cover_asset_id: '',
      original_image_asset_id: '',
      vocabulary: [{ icon_asset_id: '', audio_target_id: '', audio_version_id: '' }]
    })
    expect(form.cover_asset_id).toBeNull()
    expect(form.original_image_asset_id).toBeNull()
    expect(form.vocabulary[0]).toMatchObject({
      icon_asset_id: null,
      audio_target_id: null,
      audio_version_id: null
    })
  })
  it('keeps stable ids and typed bilingual fields when loading and reordering rows', () => {
    const form = normalizeSceneContent({
      title_en: 'Coffee',
      title_zh: '咖啡',
      dialogue: [{ id: 'line-1', english: 'Hello', chinese: '你好', speaker: 'A' }]
    })
    expect(form.dialogue[0]).toMatchObject({
      id: 'line-1',
      english: 'Hello',
      chinese: '你好',
      timing_confirmed: false
    })
    expect(form.title_en).toBe('Coffee')
    expect(form.chunks).toEqual([])
  })
  it('creates independent stable ids for new sentence and lexicon rows', () => {
    expect(createDialogueRow().id).not.toBe(createDialogueRow().id)
    expect(createLexiconRow()).toMatchObject({
      entry_version: 1,
      source_sentence_ids: [],
      variants: []
    })
  })
  it('resets all timing when the bound audio version changes', () => {
    const form = normalizeSceneContent({
      audio: { target_id: 'a', version_id: 'v1', asset_id: 'asset', duration_ms: 3000 },
      dialogue: [
        { id: 's', start_ms: 0, end_ms: 2000, audio_version_id: 'v1', timing_confirmed: true }
      ]
    })
    replaceSceneAudio(form, {
      target_id: 'a',
      version_id: 'v2',
      asset_id: 'new',
      duration_ms: 4000
    })
    expect(form.dialogue[0]).toMatchObject({
      start_ms: null,
      end_ms: null,
      audio_version_id: null,
      timing_confirmed: false
    })
  })
  it('keeps timing for the same immutable audio version', () => {
    const form = normalizeSceneContent({
      audio: { target_id: 'a', version_id: 'v1', asset_id: 'asset', duration_ms: 3000 },
      dialogue: [
        { id: 's', start_ms: 0, end_ms: 2000, audio_version_id: 'v1', timing_confirmed: true }
      ]
    })
    replaceSceneAudio(form, form.audio)
    expect(form.dialogue[0]?.timing_confirmed).toBe(true)
  })
})
