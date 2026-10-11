import { describe, expect, it } from 'vitest'

import {
  createDialogueRow,
  createLexiconRow,
  normalizeSceneContent,
  replaceSceneAudio,
  resetSceneContent
} from './scene-form'

describe('scene form', () => {
  it('removes previous content metadata when loading another draft', () => {
    const form = normalizeSceneContent({ private_old_field: 'previous', title_en: 'Old' })
    resetSceneContent(form, { title_en: 'New' })
    expect(form.title_en).toBe('New')
    expect(form).not.toHaveProperty('private_old_field')
  })
  it('preserves revision metadata and current sense/source identities', () => {
    const form = normalizeSceneContent({
      content_type: 'word_card',
      primary_entry_id: 'word-1',
      category: 'daily',
      vocabulary: [
        {
          entry_id: 'word-1',
          sense_id: 'sense-1',
          source_id: 'source-1',
          source_sentence: 'Coffee please'
        }
      ]
    })
    expect(form).toMatchObject({
      content_type: 'word_card',
      primary_entry_id: 'word-1',
      category: 'daily'
    })
    expect(form.vocabulary[0]).toMatchObject({ sense_id: 'sense-1', source_id: 'source-1' })
  })
  it('removes unsupported chunk images from submitted drafts', () => {
    const chunk = normalizeSceneContent({
      chunks: [{ english: 'of course', icon_asset_id: 'old', image_asset_id: 'old' }]
    }).chunks[0]
    expect(chunk?.icon_asset_id).toBeNull()
    expect(chunk).not.toHaveProperty('image_asset_id')
  })
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
        {
          id: 's',
          start_ms: 0,
          end_ms: 2000,
          audio_version_id: 'v1',
          timing_confirmed: true,
          slice_target_id: 'slice',
          slice_version: 'cut-v1'
        }
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
      timing_confirmed: false,
      slice_target_id: null,
      slice_version: null
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
