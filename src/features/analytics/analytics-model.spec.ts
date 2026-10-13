import { describe, expect, it } from 'vitest'

import { groupAnalyticsRows, toRatioViewModel, validateAnalyticsRows } from './analytics-model'

describe('analytics model', () => {
  it.each([
    ['SHORT_READING_STARTS', '短文开始学习'],
    ['SHORT_READING_COMPLETIONS', '短文学习完成'],
    ['WEEK_ACTIVE_USERS', '自然周活跃用户'],
    ['MONTH_ACTIVE_USERS', '自然月活跃用户']
  ])('accepts %s and displays its Chinese trend label', (metric, label) => {
    const rows = [{ day: '2026-10-12', dimension: 'ALL', metric, value: 0 }]
    expect(validateAnalyticsRows(rows).valid).toBe(true)
    expect(groupAnalyticsRows(rows, 'day')).toEqual([
      { label: `${label} · 全部`, values: [0], xAxis: ['2026-10-12'] }
    ])
  })

  it('accepts anonymous short-reading content dimensions', () => {
    expect(
      validateAnalyticsRows([
        {
          day: '2026-10-12',
          dimension: 'short_reading:READING-1',
          metric: 'SCENE_STARTS',
          value: 1
        }
      ]).valid
    ).toBe(true)
  })

  it.each(['short_reading:user_1', 'short_reading:openid_1', 'short_reading:../READING-1'])(
    'rejects unsafe short-reading dimension %s',
    (dimension) => {
      expect(
        validateAnalyticsRows([{ day: '2026-10-12', dimension, metric: 'SCENE_STARTS', value: 1 }])
          .valid
      ).toBe(false)
    }
  )

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
