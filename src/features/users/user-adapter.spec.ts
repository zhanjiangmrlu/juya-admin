import { describe, expect, it, vi } from 'vitest'

import type { ApiClient, ApiRequestOptions } from '@/services/api/api-client'

import { createUserAdapter } from './user-adapter'

const contact = {
  change_pending: false,
  contact_status: 'CONTACTED',
  updated_at: '2026-09-29T08:00:00Z',
  verified_at: '2026-09-29T07:00:00Z',
  verified_by: 'admin-1',
  wechat_id: 'wx-private'
}

const projection = {
  account_status: 'ACTIVE',
  contact,
  contact_degraded: false,
  formal_entitlement_count: 2,
  last_active_at: '2026-09-29T08:00:00Z',
  limited_entitlement_count: 1,
  open_feedback_count: 3,
  user_id: 'USER-1'
}

describe('user adapter', () => {
  it('sends profile and entitlement filters with server pagination and preserves identity summaries', async () => {
    const request = vi.fn().mockResolvedValue([
      {
        ...projection,
        juya_number: 'JY123',
        nickname: '学习者',
        open_scene_completed_count: 3,
        change_pending: true
      }
    ])
    const adapter = createUserAdapter({ request } as ApiClient)
    const rows = await adapter.searchUsers('学习者', 'PENDING', undefined, {
      page: 3,
      page_size: 20,
      entitlement_type: 'LIMITED',
      entitlement_status: 'PENDING',
      profile_completeness: 'COMPLETE'
    })
    expect(request.mock.calls[0]?.[0].query).toMatchObject({
      page: 3,
      page_size: 20,
      entitlement_type: 'LIMITED',
      entitlement_status: 'PENDING',
      profile_completeness: 'COMPLETE'
    })
    expect(rows[0]).toMatchObject({
      juya_number: 'JY123',
      nickname: '学习者',
      open_scene_completed_count: 3,
      change_pending: true
    })
  })
  it('sends contact status only as a normal GET query and validates list contacts', async () => {
    const request = vi
      .fn<(options: ApiRequestOptions) => Promise<unknown>>()
      .mockResolvedValue([projection])
    const adapter = createUserAdapter({ request } as ApiClient)
    const signal = new AbortController().signal

    const result = await adapter.searchUsers('USER', 'CONTACTED', signal)

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/v1/admin/users',
      query: { contact_status: 'CONTACTED', query: 'USER' },
      signal
    })
    expect(result[0]?.contact).toEqual(contact)
  })

  it('keeps a full WeChat value in the POST body only', async () => {
    const request = vi
      .fn<(options: ApiRequestOptions) => Promise<unknown>>()
      .mockResolvedValue([projection])
    const adapter = createUserAdapter({ request } as ApiClient)

    await adapter.searchByWechat({ wechat_id: 'wx-private' })

    expect(request).toHaveBeenCalledWith({
      body: { wechat_id: 'wx-private' },
      method: 'POST',
      path: '/api/v1/admin/users/search-by-wechat',
      signal: undefined
    })
    expect(JSON.stringify(vi.mocked(request).mock.calls[0]?.[0].query ?? {})).not.toContain(
      'wx-private'
    )
  })

  it('parses contact verification metadata and the learning overview', async () => {
    const request = vi.fn<(options: ApiRequestOptions) => Promise<unknown>>().mockResolvedValue({
      ...projection,
      favorite_count: 4,
      learning_days: 12,
      learning_degraded: false,
      open_scene_completed_count: 7
    })
    const adapter = createUserAdapter({ request } as ApiClient)

    const result = await adapter.getUserDetail('USER/1')

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/v1/admin/users/USER%2F1',
      signal: undefined
    })
    expect(result).toMatchObject({
      contact,
      favorite_count: 4,
      learning_days: 12,
      learning_degraded: false,
      open_scene_completed_count: 7
    })
  })
})
