import { describe, expect, it } from 'vitest'

import {
  candidateSelection,
  emptyPayload,
  moveArticle,
  publishErrors,
  timelineCharacters,
  topicLabel
} from './listening-model'

describe('听读业务边界', () => {
  it('草稿完整性校验不将原图、时间轴或试听当成发布条件', () => {
    const payload = emptyPayload()
    expect(publishErrors(payload, 'topic')).toContain('请上传完整英文音频')
    Object.assign(payload, {
      title_zh: '中文',
      title_en: 'Title',
      body_en: 'Hello.',
      translation_zh: '你好',
      audio_id: 'audio'
    })
    payload.expressions = Array.from({ length: 5 }, () => ({
      english: 'hi',
      chinese: '你好',
      example: 'Hi there.'
    }))
    expect(publishErrors(payload, 'topic')).toEqual([])
    payload.expressions.push({ english: 'extra', chinese: '', example: '' })
    expect(publishErrors(payload, 'topic')).toContain('需要恰好5组完整表达、中文释义和替换例句')
  })
  it('无法读取候选可删除但不能保存，重复和已保存候选不再次保存', () => {
    const candidates = ['complete', 'incomplete', 'unreadable', 'duplicate', 'saved'].map(
      (state, index) => ({ id: String(index), state, removed: false })
    )
    expect(candidateSelection(candidates, ['0', '1', '2', '3', '4'])).toEqual({
      selected: ['0', '1', '2', '3', '4'],
      save: ['0', '1'],
      publish: ['0'],
      remove: ['0', '1', '2', '3'],
      excluded: 3
    })
    candidates[0]!.removed = true
    expect(candidateSelection(candidates, ['0', '2']).save).toEqual([])
  })
  it('只移动所选完整顺序中的文章，不修改输入或跨越边界', () => {
    const ids = ['a', 'b', 'c']
    expect(moveArticle(ids, 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moveArticle(ids, 'a', -1)).toEqual(ids)
    expect(ids).toEqual(['a', 'b', 'c'])
  })
  it('按Unicode码点及真实媒体时钟定位，拖动回退清除旧高亮', () => {
    const words = [{ start: 2, end: 4, start_ms: 1000, end_ms: 2000, sentence_id: '0' }]
    expect(
      timelineCharacters('🌱 hi', words, 1.6)
        .filter((char) => char.active)
        .map((char) => char.text)
    ).toEqual(['i'])
    expect(timelineCharacters('🌱 hi', words, 0).some((char) => char.active || char.trail)).toBe(
      false
    )
  })
})

it('keeps static phrase colors underneath time-bound media highlights', () => {
  const chars = timelineCharacters(
    '🌱 a day in life.',
    [{ start: 2, end: 3, start_ms: 0, end_ms: 100, sentence_id: '0' }],
    0.05,
    ['a day in life']
  )
  expect(chars[2]).toMatchObject({ active: true, background: '#e4efd6' })
  expect(chars[5]).toMatchObject({ active: false, background: '#e4efd6' })
  expect(timelineCharacters('🌱 a day in life.', [], 1, ['a day in life'])[2]).toMatchObject({
    active: false,
    trail: false,
    background: '#e4efd6'
  })
})

it('shows topic English first, omits empty Chinese and tolerates legacy English', () => {
  expect(topicLabel({ name_en: 'Everyday English', name: '日常生活' })).toBe(
    'Everyday English / 日常生活'
  )
  expect(topicLabel({ name_en: 'Everyday English', name: '' })).toBe('Everyday English')
  expect(topicLabel({ name_en: '', name: '旧主题' })).toBe('旧主题')
})
