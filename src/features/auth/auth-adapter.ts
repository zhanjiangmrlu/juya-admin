import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

export type PasswordCredentials = components['schemas']['PasswordLoginRequest']

export interface AuthSession {
  csrfToken: string
  expiresAt: string
}

export interface AuthAdapter {
  logout(csrfToken: string | null): Promise<void>
  probeSession(): Promise<AuthSession>
  submitPassword(credentials: PasswordCredentials): Promise<AuthSession>
}

/**
 * 创建管理员认证接口适配器
 *
 * @param client - 统一 API 客户端
 * @returns 提供密码登录、探测和退出能力的认证适配器
 */
export function createAuthAdapter(client: ApiClient): AuthAdapter {
  return {
    /**
     * 注销当前管理员会话
     *
     * @param csrfToken - 当前内存中的 CSRF token
     * @returns 注销命令完成后的 Promise
     */
    async logout(csrfToken: string | null): Promise<void> {
      await client.request<void>({
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        method: 'POST',
        path: '/api/v1/admin/session/logout'
      })
    },

    /**
     * 通过独立会话接口探测 Cookie 会话并恢复内存凭证
     *
     * @returns 当前会话的新 CSRF token 和过期时间
     */
    async probeSession(): Promise<AuthSession> {
      const response = await client.request<Record<string, unknown>>({
        method: 'GET',
        path: '/api/v1/admin/session'
      })

      return {
        csrfToken: requireString(response, 'csrf_token'),
        expiresAt: requireString(response, 'expires_at')
      }
    },

    /**
     * 验证管理员账号密码并建立浏览器 Cookie 会话
     *
     * @param credentials - 管理员账号和密码
     * @returns 仅保存在内存中的 CSRF token 和过期时间
     */
    async submitPassword(credentials: PasswordCredentials): Promise<AuthSession> {
      const response = await client.request<Record<string, unknown>>({
        body: credentials,
        method: 'POST',
        path: '/api/v1/admin/session'
      })

      return {
        csrfToken: requireString(response, 'csrf_token'),
        expiresAt: requireString(response, 'expires_at')
      }
    }
  }
}

/**
 * 从未知接口对象读取必需字符串字段
 *
 * @param source - 接口响应对象
 * @param key - 需要读取的字段名
 * @returns 非空字符串字段值
 */
function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`认证接口响应缺少字段：${key}`)
  }
  return value
}
