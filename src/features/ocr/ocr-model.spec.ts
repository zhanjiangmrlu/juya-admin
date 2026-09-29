import { describe, expect, it } from 'vitest'

import { mergeAcceptedOcrFields } from './ocr-model'

describe('ocr model', () => {
  it('only replaces explicitly accepted fields', () => {
    const manual = { body: '人工正文', title: '人工标题' }
    const candidate = { body: '候选正文', title: '候选标题' }
    expect(mergeAcceptedOcrFields(manual, candidate, ['title'])).toEqual({
      body: '人工正文',
      title: '候选标题'
    })
  })
})
