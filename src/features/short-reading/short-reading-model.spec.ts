import { describe, expect, it } from 'vitest'

import { normalizeShortReading, shortReadingProblems } from './short-reading-model'

describe('pure short reading draft', () => {
  it('retains complete paragraphs and translation without lexical or sentence fields', () => {
    const content = normalizeShortReading({
      title_en: 'Daily',
      paragraphs_en: ['A full paragraph.', 'Another paragraph.'],
      translation_zh: '完整中文',
      words: [{ english: 'ignored' }],
      dialogue: [{ english: 'ignored' }],
      explanation: 'ignored'
    })
    expect(content.paragraphs_en).toEqual(['A full paragraph.', 'Another paragraph.'])
    expect(content.translation_zh).toBe('完整中文')
    expect(content).not.toHaveProperty('words')
    expect(content).not.toHaveProperty('dialogue')
    expect(content).not.toHaveProperty('explanation')
  })
  it('allows no audio or cover once pure reading metadata is complete', () => {
    const content = normalizeShortReading({
      title_en: 'Daily',
      title_zh: '日常',
      category: '生活',
      topic: '文化',
      level: 'A2',
      safe_intro: '简介',
      copyright_source: '自编/自有',
      copyright_status: 'CONFIRMED',
      paragraphs_en: ['Full text'],
      translation_zh: '全文'
    })
    expect(shortReadingProblems(content)).toEqual([])
    expect(content.audio).toBeNull()
    expect(content.cover_asset_id).toBeNull()
  })
})
