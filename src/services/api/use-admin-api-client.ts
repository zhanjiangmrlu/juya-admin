import { useRouter } from 'vue-router'

import { useAuthStore } from '@/features/auth/auth-store'

import type { ApiClient } from './api-client'

import { createApiClient } from './api-client'

/**
 * 创建绑定当前管理员 CSRF 与 401 清理流程的 API 客户端
 *
 * @returns 当前页面可安全执行读写请求的 API 客户端
 */
export function useAdminApiClient(): ApiClient {
  const authStore = useAuthStore()
  const router = useRouter()
  return createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    getCsrfToken: () => authStore.csrfToken,
    onUnauthorized: () => {
      authStore.clearSensitiveState()
      void router.replace({ name: 'login' })
    }
  })
}
