import { describe, expect, it, vi } from 'vitest'

import type { AnalyticsSnapshot } from './analytics-model'

import { useAnalytics } from './use-analytics'

describe('analytics controller', () => {
  it('uses latest period only when older requests finish late', async () => {
    let resolveFirst!: (value: AnalyticsSnapshot) => void
    const query = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValue({
        activityBasis: 'CALENDAR_MONTH_USERS',
        period: 'month',
        timezone: 'Asia/Shanghai',
        start: '2026-09-01',
        end: '2026-09-30',
        rows: [{ day: '2026-09-01', dimension: 'ALL', metric: 'NEW_USERS', value: 5 }],
        ratios: []
      })
    const controller = useAnalytics({ query })
    const first = controller.load('2026-09-01', '2026-09-30', 'week')
    await controller.load('2026-09-01', '2026-09-30', 'month')
    resolveFirst({
      activityBasis: 'PERSON_DAYS',
      period: 'week',
      timezone: 'Asia/Shanghai',
      start: '2026-09-01',
      end: '2026-09-30',
      rows: [],
      ratios: []
    })
    await first
    expect(controller.rows.value[0]?.value).toBe(5)
    expect(controller.activityBasis.value).toBe('CALENDAR_MONTH_USERS')
    expect(controller.isLoading.value).toBe(false)
  })
  it('loads and validates anonymous rows', async () => {
    const query = vi.fn(async (): Promise<AnalyticsSnapshot> => ({
      activityBasis: 'DAILY_USERS',
      period: 'day',
      timezone: 'Asia/Shanghai',
      start: '2026-09-01',
      end: '2026-09-29',
      rows: [{ day: '2026-09-29', dimension: 'all', metric: 'ACTIVE_USERS', value: 12 }],
      ratios: []
    }))
    const controller = useAnalytics({ query })
    await controller.load('2026-09-01', '2026-09-29')
    expect(controller.rows.value).toHaveLength(1)
    expect(controller.error.value).toBeNull()
  })
})
