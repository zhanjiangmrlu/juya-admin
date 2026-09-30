import { describe, expect, it, vi } from 'vitest'

import { createApiClient } from '@/services/api/api-client'

import { createAnalyticsAdapter } from './analytics-adapter'

const responseBody = {
  end: '2026-09-30',
  period: 'week',
  start: '2026-09-01',
  timezone: 'Asia/Shanghai',
  ratios: [],
  rows: [{ day: '2026-09-28', dimension: 'ALL', metric: 'NEW_USERS', value: 3 }]
}

describe('analytics query adapter', () => {
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
