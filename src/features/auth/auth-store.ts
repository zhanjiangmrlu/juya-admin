import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { createApiClient } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

import { type AuthAdapter, createAuthAdapter, type PasswordCredentials } from './auth-adapter'

export type AuthStatus = 'error' | 'idle' | 'loading'

/**
 * 创建绑定指定认证适配器的 Pinia Store 定义
 *
 * @param adapter - 认证接口适配器
 * @param storeId - Pinia Store 唯一标识，测试可使用独立标识隔离状态
 * @returns 可由 Pinia 实例化的认证 Store 定义
 */
export function createUseAuthStore(adapter: AuthAdapter, storeId = 'auth') {
  return defineStore(storeId, () => {
    const csrfToken = ref<string | null>(null)
    const errorMessage = ref<string | null>(null)
    const hasSession = ref(false)
    const sessionExpiresAt = ref<string | null>(null)
    const status = ref<AuthStatus>('idle')
    const isAuthenticated = computed(() => hasSession.value)

    /**
     * 提交账号密码并将会话信息保存到内存状态，密码不会写入 Store
     *
     * @param credentials - 管理员账号和密码
     * @returns 密码验证完成后的 Promise
     */
    async function submitPassword(credentials: PasswordCredentials): Promise<void> {
      status.value = 'loading'
      errorMessage.value = null
      try {
        const session = await adapter.submitPassword(credentials)
        csrfToken.value = session.csrfToken
        sessionExpiresAt.value = session.expiresAt
        hasSession.value = true
        status.value = 'idle'
      } catch (error) {
        status.value = 'error'
        errorMessage.value = toAuthErrorMessage(error)
        throw error
      }
    }

    /**
     * 探测现有 Cookie 会话是否仍有效
     *
     * @returns 会话有效时返回 true，否则清理敏感状态并返回 false
     */
    async function probeSession(): Promise<boolean> {
      try {
        const session = await adapter.probeSession()
        csrfToken.value = session.csrfToken
        sessionExpiresAt.value = session.expiresAt
        hasSession.value = true
        return true
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSensitiveState()
          return false
        }
        throw error
      }
    }

    /**
     * 注销当前会话并始终清理内存敏感状态
     *
     * @returns 注销流程完成后的 Promise
     */
    async function logout(): Promise<void> {
      try {
        await adapter.logout(csrfToken.value)
      } finally {
        clearSensitiveState()
      }
    }

    /**
     * 清除 CSRF token 和会话状态
     *
     * @returns 无返回值
     */
    function clearSensitiveState(): void {
      csrfToken.value = null
      errorMessage.value = null
      hasSession.value = false
      sessionExpiresAt.value = null
      status.value = 'idle'
    }

    return {
      clearSensitiveState,
      csrfToken,
      errorMessage,
      isAuthenticated,
      logout,
      probeSession,
      sessionExpiresAt,
      status,
      submitPassword
    }
  })
}

/**
 * 将认证异常转换为登录页可展示的安全提示
 *
 * @param error - 捕获到的未知异常
 * @returns 面向管理员的简洁错误提示
 */
function toAuthErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '认证请求失败，请稍后重试'
}

const runtimeAuthClient = createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL })
export const useAuthStore = createUseAuthStore(createAuthAdapter(runtimeAuthClient))
