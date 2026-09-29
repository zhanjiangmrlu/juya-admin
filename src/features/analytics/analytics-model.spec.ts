import { describe, expect, it } from 'vitest'

import { toRatioViewModel, validateAnalyticsRows } from './analytics-model'

describe('analytics model', () => {
  it('rejects unknown metrics and personal dimensions', () => {
    expect(
      validateAnalyticsRows([
        { day: '2026-09-29', dimension: 'user_1', metric: 'USER_TRACE', value: 1 }
      ]).valid
    ).toBe(false)
  })

  it('keeps numerator and denominator when a ratio is undefined', () => {
    expect(toRatioViewModel({ denominator: 0, numerator: 0 })).toEqual({
      denominator: 0,
      numerator: 0,
      rate: null
    })
  })
})
