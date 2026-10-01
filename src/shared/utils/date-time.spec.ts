import { describe, expect, it } from 'vitest'

import { formatDateTime } from './date-time'

describe('formatDateTime', () => {
  it.each([
    ['2026-09-29T12:34:35.559979Z', '2026-09-29 20:34:35'],
    ['2026-10-01T16:01:33.846852Z', '2026-10-02 00:01:33'],
    ['2026-10-01T09:05:02+08:00', '2026-10-01 09:05:02'],
    [null, '—'],
    ['', '—'],
    ['invalid', '—']
  ])('formats %s as %s', (value, expected) => {
    expect(formatDateTime(value)).toBe(expected)
  })
})
