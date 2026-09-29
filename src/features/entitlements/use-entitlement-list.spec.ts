import { describe, expect, it, vi } from 'vitest'

import type { EntitlementQueryAdapter } from './entitlement-query-adapter'

import { useEntitlementList } from './use-entitlement-list'

describe('entitlement list state', () => {
  it('uses server total and keeps a visible empty state', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 2, pageSize: 20, total: 21 })
    const controller = useEntitlementList({ list } as unknown as EntitlementQueryAdapter)
    await controller.load({ page: 2 })
    expect(controller.state.value).toBe('empty')
    expect(controller.page.value.total).toBe(21)
  })

  it('gives recovery copy after a failed request', async () => {
    const list = vi.fn().mockRejectedValue(new Error('network'))
    const controller = useEntitlementList({ list } as unknown as EntitlementQueryAdapter)
    await controller.load({ page: 1 })
    expect(controller.state.value).toBe('error')
    expect(controller.error.value).toContain('重试')
  })
})
