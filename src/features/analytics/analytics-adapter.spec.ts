import { describe, expect, it, vi } from 'vitest'

import { createApiClient } from '@/services/api/api-client'

import { createAnalyticsAdapter } from './analytics-adapter'
import { RATIO_BASES } from './analytics-model'

const responseBody = {
  activity_basis: 'PERSON_DAYS',
  end: '2026-09-30',
  period: 'week',
  start: '2026-09-01',
  timezone: 'Asia/Shanghai',
  ratios: [],
  rows: [{ day: '2026-09-28', dimension: 'ALL', metric: 'NEW_USERS', value: 3 }]
}

describe('analytics query adapter', () => {
  it('preserves the server active-user counting basis', async () => {
    const adapter = createAnalyticsAdapter(
      createApiClient({
        fetchImplementation: async () => new Response(JSON.stringify(responseBody))
      })
    )
    expect((await adapter.query('2026-09-01', '2026-09-30', 'week')).activityBasis).toBe(
      'PERSON_DAYS'
    )
  })
  it('rejects an unknown active-user counting basis', async () => {
    const adapter = createAnalyticsAdapter(
      createApiClient({
        fetchImplementation: async () =>
          new Response(JSON.stringify({ ...responseBody, activity_basis: 'INVENTED' }))
      })
    )
    await expect(adapter.query('2026-09-01', '2026-09-30', 'week')).rejects.toThrow('活跃统计口径')
  })
  it('displays weighted response seconds without percentage bounds', async () => {
    const rows = [
      {
        day: '2026-09-28',
        metric: 'FEEDBACK_RESPONSE_SECONDS',
        dimension: 'NUMERATOR',
        value: 1200
      },
      { day: '2026-09-28', metric: 'FEEDBACK_RESPONSE_SECONDS', dimension: 'DENOMINATOR', value: 2 }
    ]
    const ratios = [
      {
        day: '2026-09-28',
        metric: 'FEEDBACK_RESPONSE_SECONDS',
        dimension: null,
        unit: 'seconds',
        numerator: 1200,
        denominator: 2,
        rate: 600,
        basis: RATIO_BASES.FEEDBACK_RESPONSE_SECONDS
      }
    ]
    const adapter = createAnalyticsAdapter(
      createApiClient({
        fetchImplementation: async () =>
          new Response(JSON.stringify({ ...responseBody, rows, ratios }))
      })
    )
    expect((await adapter.query('2026-09-01', '2026-09-30', 'week')).ratios[0]).toMatchObject({
      unit: 'seconds',
      rate: 600
    })
  })
  it('keeps mode-specific numerator and denominator pairs separate', async () => {
    const rows = ['MODE_3', 'MODE_5'].flatMap((dimension) => [
      {
        day: '2026-09-28',
        dimension: `${dimension}_NUMERATOR`,
        metric: 'LIMITED_STARTS',
        value: 1
      },
      {
        day: '2026-09-28',
        dimension: `${dimension}_DENOMINATOR`,
        metric: 'LIMITED_STARTS',
        value: 2
      }
    ])
    const ratios = ['MODE_3', 'MODE_5'].map((dimension) => ({
      dimension,
      day: '2026-09-28',
      metric: 'LIMITED_STARTS',
      numerator: 1,
      denominator: 2,
      rate: 0.5,
      basis: RATIO_BASES.LIMITED_STARTS
    }))
    const adapter = createAnalyticsAdapter(
      createApiClient({
        fetchImplementation: async () =>
          new Response(JSON.stringify({ ...responseBody, rows, ratios }))
      })
    )
    expect(
      (await adapter.query('2026-09-01', '2026-09-30', 'week')).ratios.map((item) => item.dimension)
    ).toEqual(['MODE_3', 'MODE_5'])
  })
  const counts = [
    { day: '2026-09-28', dimension: 'NUMERATOR', metric: 'FEEDBACK_SLA', value: 4 },
    { day: '2026-09-28', dimension: 'DENOMINATOR', metric: 'FEEDBACK_SLA', value: 5 }
  ]
  const ratio = {
    day: '2026-09-28',
    metric: 'FEEDBACK_SLA',
    numerator: 4,
    denominator: 5,
    rate: 0.8,
    basis: RATIO_BASES.FEEDBACK_SLA
  }
  it.each([
    { rows: counts, ratios: [{ ...ratio, numerator: 1, denominator: 10, rate: 0.1 }] },
    { rows: counts, ratios: [] },
    { rows: counts, ratios: [ratio, ratio] },
    { rows: [...counts, counts[0]], ratios: [ratio] },
    { rows: [counts[0]], ratios: [ratio] },
    { rows: [], ratios: [ratio] },
    { rows: [{ ...responseBody.rows[0], day: '2035-01-02' }], ratios: [] },
    { rows: [{ ...responseBody.rows[0], day: '2026-09-29' }], ratios: [] }
  ])('rejects inconsistent counts, ratios or period buckets: %s', async (overrides) => {
    const adapter = createAnalyticsAdapter(
      createApiClient({
        fetchImplementation: async () =>
          new Response(JSON.stringify({ ...responseBody, ...overrides }))
      })
    )
    await expect(adapter.query('2026-09-01', '2026-09-30', 'week')).rejects.toThrow()
  })
  it('accepts a partial first ISO-week bucket and matching zero denominator', async () => {
    const adapter = createAnalyticsAdapter(
      createApiClient({
        fetchImplementation: async () =>
          new Response(
            JSON.stringify({
              ...responseBody,
              rows: counts.map((row) => ({ ...row, day: '2026-08-31', value: 0 })),
              ratios: [{ ...ratio, day: '2026-08-31', numerator: 0, denominator: 0, rate: null }]
            })
          )
      })
    )
    expect((await adapter.query('2026-09-01', '2026-09-30', 'week')).ratios[0]?.rate).toBeNull()
  })
  it('uses the real period query route and generated response boundary', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(responseBody))
    )
    const adapter = createAnalyticsAdapter(createApiClient({ fetchImplementation }))
    const result = await adapter.query('2026-09-01', '2026-09-30', 'week')
    const url = new URL(String(fetchImplementation.mock.calls[0]?.[0]), 'http://localhost')
    expect(url.pathname).toBe('/api/v1/admin/analytics')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      end: '2026-09-30',
      period: 'week',
      start: '2026-09-01'
    })
    expect(result.rows).toEqual(responseBody.rows)
  })

  it.each([
    { metric: 'TRACE', dimension: 'ALL' },
    { metric: 'NEW_USERS', dimension: 'wechat:secret' },
    { metric: 'NEW_USERS', dimension: 'arbitrary-secret' },
    { metric: 'NEW_USERS', dimension: 'scene:user_id1' }
  ])('rejects unsafe responses before returning data: %s', async (unsafe) => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ...responseBody, rows: [{ ...responseBody.rows[0], ...unsafe }] })
        )
    )
    const adapter = createAnalyticsAdapter(createApiClient({ fetchImplementation }))
    await expect(adapter.query('2026-09-01', '2026-09-30', 'week')).rejects.toThrow()
  })

  it('rejects mismatched periods and invented ratios', async () => {
    const adapter = createAnalyticsAdapter(
      createApiClient({
        fetchImplementation: async () =>
          new Response(
            JSON.stringify({
              ...responseBody,
              ratios: [
                {
                  day: '2026-09-28',
                  metric: 'FEEDBACK_SLA',
                  numerator: 0,
                  denominator: 0,
                  rate: 0,
                  basis: 'SLA'
                }
              ]
            })
          )
      })
    )
    await expect(adapter.query('2026-09-01', '2026-09-30', 'week')).rejects.toThrow()
    await expect(adapter.query('2026-09-01', '2026-09-30', 'month')).rejects.toThrow()
  })
})
