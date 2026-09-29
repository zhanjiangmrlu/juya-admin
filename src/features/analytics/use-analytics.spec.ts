import { describe, expect, it, vi } from 'vitest'

import { useAnalytics } from './use-analytics'

describe('analytics controller', () => {
  it('loads and validates anonymous rows', async () => {
    const exportRows = vi.fn(async () => [
      { day: '2026-09-29', dimension: 'all', metric: 'ACTIVE_USERS', value: 12 }
    ])
    const controller = useAnalytics({ exportRows })
    await controller.load('2026-09-01', '2026-09-29')
    expect(controller.rows.value).toHaveLength(1)
    expect(controller.error.value).toBeNull()
  })
})
