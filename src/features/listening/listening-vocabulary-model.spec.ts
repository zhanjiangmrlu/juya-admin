import { expect, it } from 'vitest'

import { sentenceOptions, vocabularyErrors, wordOptions } from './listening-vocabulary-model'

it('keeps Unicode code point offsets and separate repeated sentences', () => {
  const body = '😀 Go home.\nGo home.'
  expect(sentenceOptions(body)).toEqual([
    { start: 0, end: 10, quote: '😀 Go home.' },
    { start: 11, end: 19, quote: 'Go home.' }
  ])
  expect(wordOptions(body, { start: 11, end: 19 })).toContainEqual({
    word_start: 14,
    word_end: 18,
    word: 'home'
  })
})
it('requires explicit source confirmation and invalidates stale body offsets', () => {
  const word = {
    id: 'w',
    english: 'go',
    meaning: '走',
    phonetic: '',
    source_hint: '',
    source: {
      start: 0,
      end: 8,
      quote: 'He goes.',
      word_start: 3,
      word_end: 7,
      word: 'goes',
      confirmed: false
    }
  }
  expect(vocabularyErrors('He goes.', [word])).toContain('词汇1：请确认原句及词形对应')
  word.source.confirmed = true
  expect(vocabularyErrors('He goes.', [word])).toEqual([])
  expect(vocabularyErrors('😀 He goes.', [word])).toContain(
    '词汇1：正文已变化，请重新选择来源原句和词形'
  )
  expect(vocabularyErrors('He goes.', [])).toEqual([])
})

it('accepts a unique exact original word and requires confirmation when another source is possible', () => {
  const word = {
    id: 'w',
    english: 'goes',
    meaning: '走',
    phonetic: '',
    source_hint: '',
    source: {
      start: 0,
      end: 8,
      quote: 'He goes.',
      word_start: 3,
      word_end: 7,
      word: 'goes',
      confirmed: false
    }
  }
  expect(vocabularyErrors('He goes.', [word])).toEqual([])
  expect(vocabularyErrors('He goes. She goes.', [word])).toContain('词汇1：请确认原句及词形对应')
})

it('offers the exact server sentence boundaries and rejects partial sentence or invalid English entries', () => {
  expect(sentenceOptions('Hello?!\n"Good day."  Next.')).toEqual([
    { start: 0, end: 6, quote: 'Hello?' },
    { start: 8, end: 18, quote: '"Good day.' },
    { start: 18, end: 26, quote: '"  Next.' }
  ])
  const word = {
    id: 'w',
    english: 'Hello',
    meaning: '你好',
    phonetic: '',
    source_hint: '',
    source: {
      start: 0,
      end: 5,
      quote: 'Hello',
      word_start: 0,
      word_end: 5,
      word: 'Hello',
      confirmed: true
    }
  }
  expect(vocabularyErrors('Hello world.', [word])).not.toEqual([])
  expect(
    vocabularyErrors('Hello.', [
      { ...word, english: 'Hello 123', source: { ...word.source, end: 6, quote: 'Hello.' } }
    ])
  ).not.toEqual([])
})
