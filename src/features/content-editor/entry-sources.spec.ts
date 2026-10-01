import { expect, it } from 'vitest'

import { entrySources } from './entry-sources'
import { createDialogueRow, createLexiconRow } from './scene-form'

it('shows the actual clicked original sentence first while retaining explicit source membership', () => {
  const a = { ...createDialogueRow(), id: 'a', english: 'First hello.' }
  const b = { ...createDialogueRow(), id: 'b', english: 'Second hello.' }
  const entry = { ...createLexiconRow(), entry_id: 'w', source_sentence_ids: ['a', 'b', 'missing'] }
  expect(entrySources(entry, [a, b], 'b').map((row) => row.id)).toEqual(['b', 'a'])
  expect(entrySources(entry, [a, b], 'other').map((row) => row.id)).toEqual(['a', 'b'])
})
