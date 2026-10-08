import { describe, expect, it, vi } from 'vitest'

import type { ApiClient } from '@/services/api/api-client'

import { createAuditAdapter } from './audit-adapter'

describe('audit actor names', () => {
  it('uses the account name and labels system and unresolved identities explicitly', async () => {
    const request = vi.fn<ApiClient['request']>().mockResolvedValue({
      items: [
        ['1', '运营管理员'],
        ['ADMIN-PUBLIC-ID', '第二管理员'],
        ['system', null],
        ['2', null],
        [null, null]
      ].map(([actor, name]) => ({
        action: 'settings.update',
        actor_public_id: actor,
        actor_name: name,
        after_summary: {},
        before_summary: {},
        object_public_id: 'settings',
        object_type: 'config',
        occurred_at: '2026-10-08T13:42:19Z',
        reason: null,
        request_id: 'REQUEST-1'
      }))
    })
    const events = await createAuditAdapter({ request } as ApiClient).list()
    expect(events.map((event) => event.actor)).toEqual([
      '运营管理员',
      '第二管理员',
      '系统',
      '未知操作人（ID：2）',
      '未知操作人'
    ])
  })
})
