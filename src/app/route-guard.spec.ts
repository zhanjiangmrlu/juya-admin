import { describe, expect, it, vi } from 'vitest'

import type { RouteLocationNormalized } from 'vue-router'

import { createRouteGuard, type RouteGuardAuthStore } from './route-guard'

/**
 * 创建可按需覆盖行为的路由守卫认证桩
 *
 * @param overrides - 需要覆盖的认证状态或方法
 * @returns 路由守卫可消费的认证 Store 桩
 */
const createAuthStore = (overrides: Partial<RouteGuardAuthStore> = {}): RouteGuardAuthStore => ({
  clearSensitiveState: vi.fn(),
  isAuthenticated: false,
  probeSession: vi.fn().mockResolvedValue(false),
  ...overrides
})

/**
 * 创建路由守卫测试使用的目标路由对象
 *
 * @param meta - 目标路由元数据
 * @returns 最小可用的标准化路由对象
 */
const createRoute = (meta: RouteLocationNormalized['meta'] = {}): RouteLocationNormalized =>
  ({ fullPath: '/users/USER-1', meta, name: 'user-detail' }) as RouteLocationNormalized

describe('route guard', () => {
  it('allows public routes without probing the session', async () => {
    const authStore = createAuthStore()
    const guard = createRouteGuard(authStore)

    await expect(guard(createRoute({ public: true }))).resolves.toBe(true)
    expect(authStore.probeSession).not.toHaveBeenCalled()
  })

  it('clears state and redirects to login when authentication probing fails', async () => {
    const authStore = createAuthStore()
    const guard = createRouteGuard(authStore)

    await expect(guard(createRoute({ sensitive: true }))).resolves.toEqual({ name: 'login' })
    expect(authStore.clearSensitiveState).toHaveBeenCalledOnce()
  })

  it('allows protected routes after a successful session probe', async () => {
    const authStore = createAuthStore({ probeSession: vi.fn().mockResolvedValue(true) })
    const guard = createRouteGuard(authStore)

    await expect(guard(createRoute())).resolves.toBe(true)
  })
})
