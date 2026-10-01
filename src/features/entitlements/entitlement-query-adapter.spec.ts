import { describe, expect, it, vi } from 'vitest'

import type { ApiClient } from '@/services/api/api-client'

import { createEntitlementQueryAdapter } from './entitlement-query-adapter'

describe('entitlement query adapter', () => {
  it('sends filters and server pagination on the unified list path', async () => {
    const request = vi.fn().mockResolvedValue({ items: [], page: 2, page_size: 20, total: 21 })
    const adapter = createEntitlementQueryAdapter({ request } as ApiClient)
    const result = await adapter.list({
      page: 2,
      status: 'ACTIVE',
      type: 'FORMAL',
      userId: 'USER-1'
    })

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/v1/admin/entitlements',
      query: { page: 2, page_size: 20, status: 'ACTIVE', type: 'FORMAL', user_id: 'USER-1' }
    })
    expect(result).toEqual({ items: [], page: 2, pageSize: 20, total: 21 })
  })

  it('encodes detail ids and reads the server allowed operations', async () => {
    const request = vi.fn().mockResolvedValue({
      available_operations: ['PAUSE'],
      expires_at: null,
      granted_at: '2026-09-29T00:00:00Z',
      id: 'FORMAL/1',
      package_id: 'PKG-1',
      package_name: '基础包',
      status: 'ACTIVE',
      term: 'permanent',
      user_id: 'USER-1',
      version: 3
    })
    const detail = await createEntitlementQueryAdapter({ request } as ApiClient).formal('FORMAL/1')

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/v1/admin/formal-entitlements/FORMAL%2F1'
    })
    expect(detail.availableOperations).toEqual(['PAUSE'])
    expect(detail.version).toBe(3)
  })

  it('uses the content package paginated path', async () => {
    const request = vi.fn().mockResolvedValue({
      items: [{ id: 'PKG-1', name: '基础包', sort_order: 1, status: 'ACTIVE' }],
      page: 1,
      page_size: 20,
      total: 1
    })
    const page = await createEntitlementQueryAdapter({ request } as ApiClient).packages(1)
    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/v1/admin/content-packages',
      query: { page: 1, page_size: 20 }
    })
    expect(page.items[0]?.name).toBe('基础包')
  })
})
