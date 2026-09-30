import { describe, expect, it } from 'vitest'

import { groupAnalyticsRows, toRatioViewModel, validateAnalyticsRows } from './analytics-model'

describe('analytics model', () => {
  it('aligns missing buckets without shifting values to earlier dates', () => {
    const series = groupAnalyticsRows(
      [
        { day: '2026-09-27', dimension: 'ALL', metric: 'NEW_USERS', value: 2 },
        { day: '2026-09-28', dimension: 'ALL', metric: 'NEW_USERS', value: 3 },
        { day: '2026-09-28', dimension: 'ALL', metric: 'FAVORITES', value: 7 }
      ],
      'week'
    )
    expect(series.map((item) => item.xAxis)).toEqual([
      ['2026-09-21', '2026-09-28'],
      ['2026-09-21', '2026-09-28']
    ])
    expect(series.map((item) => item.values)).toEqual([
      [2, 3],
      [null, 7]
    ])
  })
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
