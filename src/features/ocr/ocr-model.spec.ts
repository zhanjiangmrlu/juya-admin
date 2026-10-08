import { describe, expect, it } from 'vitest'

import { isOcrQuotaVerifiedThisMonth, mergeAcceptedOcrFields } from './ocr-model'

describe('ocr model', () => {
  it.each([
    ['2026-10-08T13:11:12.130759', '2026-10', true],
    ['2026-10-08T13:11:12Z', '2026-10', true],
    ['2026-10-01T00:00:00+08:00', '2026-10', true],
    ['2026-09-30T16:00:00.000001', '2026-10', true],
    ['2026-09-30T15:59:59.999999Z', '2026-10', false],
    ['2026-10-31T16:00:00Z', '2026-10', false],
    ['2025-10-08T13:11:12Z', '2026-10', false],
    [null, '2026-10', false],
    ['invalid', '2026-10', false]
  ] as const)(
    'restores verification %s for Beijing quota month %s as %s',
    (verifiedAt, month, expected) => {
      expect(isOcrQuotaVerifiedThisMonth(verifiedAt, month)).toBe(expected)
    }
  )

  it('only replaces explicitly accepted fields', () => {
    const manual = { body: '人工正文', title: '人工标题' }
    const candidate = { body: '候选正文', title: '候选标题' }
    expect(mergeAcceptedOcrFields(manual, candidate, ['title'])).toEqual({
      body: '人工正文',
      title: '候选标题'
    })
  })
})
