import { expect, it } from 'vitest'

import {
  resolveVocabularySource,
  sentenceOptions,
  vocabularyErrors,
  wordOptions
} from '@/features/listening/listening-vocabulary-model'

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
it('accepts located inflected words without manual confirmation and invalidates stale offsets', () => {
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
  expect(vocabularyErrors('He goes.', [word])).toEqual([])
  word.source.confirmed = true
  expect(vocabularyErrors('He goes.', [word])).toEqual([])
  expect(vocabularyErrors('😀 He goes.', [word])).toContain(
    '词汇1：正文已变化，请重新选择来源原句和词形'
  )
  expect(vocabularyErrors('He goes.', [])).toEqual([])
})

it('accepts the specified exact source when the same word occurs elsewhere', () => {
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
  expect(vocabularyErrors('He goes. She goes.', [word])).toEqual([])
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

it.each([
  ['😀 They went.', 'go', 'They went.', null],
  [
    '😀 They went.',
    'go',
    '😀 They  went.',
    {
      start: 0,
      end: 12,
      quote: '😀 They went.',
      word_start: 7,
      word_end: 11,
      word: 'went',
      confirmed: true
    }
  ],
  [
    'He studies.',
    'study',
    'He studies.',
    {
      start: 0,
      end: 11,
      quote: 'He studies.',
      word_start: 3,
      word_end: 10,
      word: 'studies',
      confirmed: true
    }
  ],
  [
    'We stopped.',
    'stop',
    'We stopped.',
    {
      start: 0,
      end: 11,
      quote: 'We stopped.',
      word_start: 3,
      word_end: 10,
      word: 'stopped',
      confirmed: true
    }
  ],
  [
    'He goes. He goes.',
    'go',
    'He goes.',
    {
      start: 0,
      end: 8,
      quote: 'He goes.',
      word_start: 3,
      word_end: 7,
      word: 'goes',
      confirmed: true
    }
  ],
  ['He goes and went.', 'go', 'He goes and went.', null],
  ['She plays.', 'go', 'She plays.', null],
  ['He goes. She goes.', 'go', '', null]
])('resolves only genuine current positions for %s', (body, english, source_hint, expected) => {
  expect(
    resolveVocabularySource(body, {
      id: 'w',
      english,
      source_hint,
      meaning: '释义',
      phonetic: '',
      source: null
    })
  ).toEqual(expected)
})

it('validates an older hint-only candidate without mutating its saved source', () => {
  const word = {
    id: 'w',
    english: 'go',
    meaning: '去',
    phonetic: '',
    source_hint: 'She goes.',
    source: null
  }
  expect(vocabularyErrors('He goes. She goes.', [word])).toEqual([])
  expect(word.source).toBeNull()
})
