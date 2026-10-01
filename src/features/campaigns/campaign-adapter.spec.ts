import { describe, expect, it, vi } from 'vitest'

import type { ApiClient } from '@/services/api/api-client'

import { createCampaignAdapter } from './campaign-adapter'

const serverCampaign = {
  available_operations: ['open', 'copy', 'capacity'],
  created_at: '2026-09-29T00:00:00Z',
  current_version: null,
  id: 'CAMP-1',
  name: '秋季活动',
  status: 'DRAFT',
  updated_at: '2026-09-29T00:00:00Z',
  version: 2
}

describe('campaign adapter', () => {
  it('maps server pagination and detail paths', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ items: [], page: 3, page_size: 20, total: 42 })
      .mockResolvedValueOnce(serverCampaign)
    const adapter = createCampaignAdapter({ request } as ApiClient)
    expect(await adapter.list(3, 'DRAFT')).toEqual({ items: [], page: 3, pageSize: 20, total: 42 })
    expect(request).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      path: '/api/v1/admin/campaigns',
      query: { page: 3, page_size: 10, status: 'DRAFT' }
    })
    const detail = await adapter.detail('CAMP/1')
    expect(detail.version).toBe(2)
    expect(detail.availableOperations).toEqual(['open', 'copy', 'capacity'])
    expect(request).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/api/v1/admin/campaigns/CAMP%2F1'
    })
  })

  it('uses idempotent write paths and the expected server version', async () => {
    const request = vi.fn().mockResolvedValue(serverCampaign)
    const adapter = createCampaignAdapter({ request } as ApiClient)
    await adapter.copy('CAMP-1', 2, 'idem-copy')
    await adapter.command('CAMP-1', 'capacity', 2, 'idem-capacity', 50)
    expect(request).toHaveBeenNthCalledWith(1, {
      body: { expected_version: 2 },
      idempotencyKey: 'idem-copy',
      method: 'POST',
      path: '/api/v1/admin/campaigns/CAMP-1/versions/copy'
    })
    expect(request).toHaveBeenNthCalledWith(2, {
      body: { capacity: 50, expected_version: 2 },
      idempotencyKey: 'idem-capacity',
      method: 'POST',
      path: '/api/v1/admin/campaigns/CAMP-1/commands/capacity'
    })
  })
})
