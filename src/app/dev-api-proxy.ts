import type { ProxyOptions } from 'vite'

const DEFAULT_DEV_API_TARGET = 'http://127.0.0.1:8000'

/**
 * 创建开发服务器使用的管理 API 代理配置
 *
 * @param target - 可选的后端代理目标
 * @returns 以 /api 为入口的 Vite 代理配置
 */
export function createDevApiProxy(target?: string): Record<string, ProxyOptions> {
  const normalizedTarget = target?.trim().replace(/\/+$/, '') || DEFAULT_DEV_API_TARGET

  return {
    '/api': {
      changeOrigin: true,
      target: normalizedTarget
    }
  }
}
