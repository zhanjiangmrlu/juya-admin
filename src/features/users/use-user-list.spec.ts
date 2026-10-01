import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { UserAdapter } from './user-adapter'

import { useUserList } from './use-user-list'

/**
 * 创建用户列表测试使用的适配器
 *
 * @returns 默认返回空用户数组的适配器桩
 */
function createAdapter(): UserAdapter {
  return {
    getUserDetail: vi.fn(),
    searchByWechat: vi.fn().mockResolvedValue([]),
    searchUsers: vi.fn().mockResolvedValue([])
  }
}

/**
 * 创建用户列表测试使用的内存路由器
 *
 * @returns 已进入用户列表页的路由器
 */
async function createUserRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ component: { template: '<div />' }, name: 'users', path: '/users' }]
  })
  await router.push('/users')
  await router.isReady()
  return router
}

describe('useUserList', () => {
  it('uses POST for WeChat search without exposing the value in the URL', async () => {
    const adapter = createAdapter()
    const router = await createUserRouter()
    const controller = useUserList(adapter, router)

    await controller.searchByWechat('wx_example')

    expect(adapter.searchByWechat).toHaveBeenCalledWith(
      { wechat_id: 'wx_example' },
      expect.any(AbortSignal)
    )
    expect(router.currentRoute.value.query).toEqual({ hasSensitiveSearch: 'true' })
    expect(router.currentRoute.value.fullPath).not.toContain('wx_example')
  })

  it.each(['', ' wx_example', 'wx example', 'x'.repeat(65)])(
    'does not send invalid WeChat value %s',
    async (value) => {
      const adapter = createAdapter()
      const controller = useUserList(adapter, await createUserRouter())

      await controller.searchByWechat(value)

      expect(adapter.searchByWechat).not.toHaveBeenCalled()
      expect(controller.error.value).not.toBeNull()
    }
  )

  it('cancels the previous normal search when a new filter is submitted', async () => {
    const adapter = createAdapter()
    let firstSignal: AbortSignal | undefined
    vi.mocked(adapter.searchUsers)
      .mockImplementationOnce((_query, _contactStatus, signal) => {
        firstSignal = signal
        return new Promise(() => undefined)
      })
      .mockResolvedValueOnce([])
    const controller = useUserList(adapter, await createUserRouter())

    void controller.search('first')
    await controller.search('second')

    expect(firstSignal?.aborted).toBe(true)
  })

  it('passes the selected contact status to the server and URL', async () => {
    const adapter = createAdapter()
    const router = await createUserRouter()
    const controller = useUserList(adapter, router)

    await controller.search('', 'UNREACHABLE')

    expect(adapter.searchUsers).toHaveBeenCalledWith(
      undefined,
      'UNREACHABLE',
      expect.any(AbortSignal),
      undefined
    )
    expect(router.currentRoute.value.query).toEqual({ contact_status: 'UNREACHABLE' })
  })
})
