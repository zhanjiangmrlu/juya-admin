import { describe, expect, it, vi } from 'vitest'

import type { UserAdapter, UserDetailDto } from './user-adapter'

import { useUserDetail } from './use-user-detail'

const degradedDetail: UserDetailDto = {
  account_status: 'ACTIVE',
  contact: null,
  contact_degraded: true,
  formal_entitlement_count: 2,
  last_active_at: '2026-09-29T08:00:00Z',
  limited_entitlement_count: 1,
  open_feedback_count: 3,
  user_id: 'USER-1'
}

/**
 * 创建用户详情测试使用的适配器。
 *
 * @returns 返回联系方式降级详情的适配器桩。
 */
function createAdapter(): UserAdapter {
  return {
    getUserDetail: vi.fn().mockResolvedValue(degradedDetail),
    searchByWechat: vi.fn(),
    searchUsers: vi.fn()
  }
}

describe('useUserDetail', () => {
  it('keeps available sections usable when the contact upstream is degraded', async () => {
    const controller = useUserDetail(createAdapter(), 'USER-1')

    await controller.load()

    expect(controller.sectionStates.value).toEqual({
      basic: 'success',
      contact: 'error',
      entitlements: 'success',
      feedback: 'success',
      learning: 'pending'
    })
    expect(controller.detail.value?.formal_entitlement_count).toBe(2)
  })
})
