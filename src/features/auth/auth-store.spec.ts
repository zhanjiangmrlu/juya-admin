import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import type { AuthAdapter } from './auth-adapter'

import { createUseAuthStore } from './auth-store'

/**
 * 创建认证 Store 测试使用的适配器桩
 *
 * @returns 所有认证步骤默认成功的适配器
 */
const createAdapter = (): AuthAdapter => ({
  logout: vi.fn().mockResolvedValue(undefined),
  probeSession: vi.fn().mockResolvedValue({
    csrfToken: 'csrf-restored',
    expiresAt: '2026-09-29T21:00:00Z'
  }),
  submitPassword: vi.fn().mockResolvedValue({
    csrfToken: 'csrf-1',
    expiresAt: '2026-09-29T20:00:00Z'
  })
})

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('creates an authenticated session from username and password without retaining the password', async () => {
    const useTestAuthStore = createUseAuthStore(createAdapter(), 'auth-password-test')
    const store = useTestAuthStore()

    await store.submitPassword({ password: 'secret', username: 'admin' })

    expect(store.isAuthenticated).toBe(true)
    expect(store.csrfToken).toBe('csrf-1')
    expect(store.sessionExpiresAt).toBe('2026-09-29T20:00:00Z')
    expect(JSON.stringify(store.$state)).not.toContain('secret')
  })

  it('restores sensitive session state after a successful session probe', async () => {
    const useTestAuthStore = createUseAuthStore(createAdapter(), 'auth-probe-success-test')
    const store = useTestAuthStore()

    await expect(store.probeSession()).resolves.toBe(true)

    expect(store.isAuthenticated).toBe(true)
    expect(store.csrfToken).toBe('csrf-restored')
    expect(store.sessionExpiresAt).toBe('2026-09-29T21:00:00Z')
  })

  it('clears sensitive state when the session probe returns 401', async () => {
    const adapter = createAdapter()
    vi.mocked(adapter.probeSession).mockRejectedValue(
      new ApiError({
        code: 'ADMIN_SESSION_INVALID',
        message: '管理员会话无效或已过期',
        requestId: 'request-401',
        status: 401
      })
    )
    const useTestAuthStore = createUseAuthStore(adapter, 'auth-probe-test')
    const store = useTestAuthStore()

    await expect(store.probeSession()).resolves.toBe(false)

    expect(store.csrfToken).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('does not turn a server failure into an unauthenticated session', async () => {
    const adapter = createAdapter()
    const failure = new ApiError({
      code: 'HTTP_500',
      message: '服务暂时不可用，请稍后重试',
      requestId: 'request-500',
      status: 500
    })
    vi.mocked(adapter.probeSession).mockRejectedValue(failure)
    const useTestAuthStore = createUseAuthStore(adapter, 'auth-probe-server-error-test')
    const store = useTestAuthStore()

    await store.submitPassword({ password: 'secret', username: 'admin' })

    await expect(store.probeSession()).rejects.toBe(failure)
    expect(store.isAuthenticated).toBe(true)
    expect(store.csrfToken).toBe('csrf-1')
  })
})
