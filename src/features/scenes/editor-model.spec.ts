import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import { blankContent, findSources, prepareContent } from './editor-model'

describe('publication candidates', () => {
  it('binds a whole word only at its actual occurrence and preserves UTF-16 offsets', () => {
    const rows = [
      { id: 'one', speaker: 'A', english: '☕ I like tea, not steak. Tea please.', chinese: '喝茶' }
    ]
    expect(findSources(rows, 'tea').map((x) => [x.start, x.end])).toEqual([
      [9, 12],
      [25, 28]
    ])
    expect(findSources(rows, 'ste')).toEqual([])
  })
  it('keeps optional blank chunks out and never discards half-written chunks', () => {
    const content = blankContent()
    content.chunks = [
      { id: 'a', english: '', chinese: '' },
      { id: 'b', english: 'May I', chinese: '' }
    ]
    expect(prepareContent(content).chunks).toEqual([{ id: 'b', english: 'May I', chinese: '' }])
    expect(content.chunks).toHaveLength(2)
  })
  it('prepares reactive chunks as an independent cloneable request snapshot', () => {
    const content = reactive(blankContent())
    content.chunks = [
      { id: 'blank', english: ' ', chinese: '' },
      { id: 'kept', english: 'get ready', chinese: '准备好' }
    ]
    const prepared = prepareContent(content)
    expect(structuredClone(prepared).chunks).toEqual([
      { id: 'kept', english: 'get ready', chinese: '准备好' }
    ])
    content.chunks[1]!.chinese = '后续修改'
    expect(prepared.chunks[0]!.chinese).toBe('准备好')
    expect(content.chunks).toHaveLength(2)
  })
})

it('refuses guessed bilingual pairing when pasted rows are ambiguous', async () => {
  const { parseDialogue } = await import('./editor-model')
  expect(() => parseDialogue('A | Hello | 你好\nUnpaired English')).toThrow('请确认')
  expect(parseDialogue('A | May I have tea? | 我想要茶')[0]).toMatchObject({
    speaker: 'A',
    english: 'May I have tea?',
    chinese: '我想要茶'
  })
})
