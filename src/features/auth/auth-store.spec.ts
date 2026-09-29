import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthAdapter } from './auth-adapter'

import { createUseAuthStore } from './auth-store'

/**
 * 创建认证 Store 测试使用的适配器桩
 *
 * @returns 所有认证步骤默认成功的适配器
 */
const createAdapter = (): AuthAdapter => ({
  logout: vi.fn().mockResolvedValue(undefined),
  probeSession: vi.fn().mockResolvedValue(undefined),
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

  it('clears sensitive state when the session probe fails', async () => {
    const adapter = createAdapter()
    vi.mocked(adapter.probeSession).mockRejectedValue(new Error('unauthorized'))
    const useTestAuthStore = createUseAuthStore(adapter, 'auth-probe-test')
    const store = useTestAuthStore()

    await expect(store.probeSession()).resolves.toBe(false)

    expect(store.csrfToken).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })
})
