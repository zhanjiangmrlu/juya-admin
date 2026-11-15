import { expect, it } from 'vitest'

import { parsePageTarget, typeIssue } from '@/features/content-catalog/content-catalog-model'

it.each(['', '0', '-1', '1.2', '2e1', 'abc', '9007199254740992', '4'])(
  'rejects invalid page %s without coercion',
  (value) => {
    expect(() => parsePageTarget(value, 3)).toThrow()
  }
)
it('normalizes whitespace and leading zeroes and accepts current page', () => {
  expect(parsePageTarget(' 003 ', 3)).toBe(3)
  expect(parsePageTarget('1', 3)).toBe(1)
})
it('blocks publication with missing type or incompatible PDF without guessing the type', () => {
  expect(typeIssue(null, true)).toContain('选择')
  expect(typeIssue('illustrated', true)).toContain('移除')
  expect(typeIssue('intensive', false)).toContain('PDF')
  expect(typeIssue('illustrated', false)).toBe('')
  expect(typeIssue('intensive', true)).toBe('')
})
