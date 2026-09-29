import { describe, expect, it, vi } from 'vitest'

import type { UserAdapter, UserDetailDto } from './user-adapter'

import { useUserDetail } from './use-user-detail'

const degradedDetail: UserDetailDto = {
  account_status: 'ACTIVE',
  contact: null,
  contact_degraded: true,
  favorite_count: null,
  formal_entitlement_count: 2,
  last_active_at: '2026-09-29T08:00:00Z',
  learning_days: null,
  learning_degraded: true,
  limited_entitlement_count: 1,
  open_scene_completed_count: null,
  open_feedback_count: 3,
  user_id: 'USER-1'
}

/**
 * 创建用户详情测试使用的适配器
 *
 * @returns 返回联系方式降级详情的适配器桩
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
      learning: 'error'
    })
    expect(controller.detail.value?.formal_entitlement_count).toBe(2)
  })

  it('marks learning as successful when aggregate counts are available', async () => {
    const adapter = createAdapter()
    vi.mocked(adapter.getUserDetail).mockResolvedValue({
      ...degradedDetail,
      favorite_count: 3,
      learning_days: 12,
      learning_degraded: false,
      open_scene_completed_count: 7
    })
    const controller = useUserDetail(adapter, 'USER-1')

    await controller.load()

    expect(controller.sectionStates.value.learning).toBe('success')
    expect(controller.detail.value?.open_scene_completed_count).toBe(7)
  })
})
