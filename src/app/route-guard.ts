import type { NavigationGuardReturn, RouteLocationNormalized, Router } from 'vue-router'

export interface RouteGuardAuthStore {
  clearSensitiveState(): void
  readonly isAuthenticated: boolean
  probeSession(): Promise<boolean>
}

/**
 * 创建管理员路由认证守卫。
 *
 * @param authStore - 提供会话状态和探测能力的认证 Store。
 * @returns 可注册到 Vue Router 的异步前置守卫。
 */
export function createRouteGuard(authStore: RouteGuardAuthStore) {
  /**
   * 校验目标路由是否允许当前会话访问。
   *
   * @param to - 即将进入的目标路由。
   * @returns 放行结果或登录页重定向。
   */
  return async function guard(to: RouteLocationNormalized): Promise<NavigationGuardReturn> {
    if (to.meta.public) return true
    if (authStore.isAuthenticated) return true

    const hasSession = await authStore.probeSession()
    if (hasSession) return true

    authStore.clearSensitiveState()
    return { name: 'login' }
  }
}

/**
 * 将管理员认证守卫安装到指定路由器。
 *
 * @param router - 应用 Vue Router 实例。
 * @param authStore - 当前 Pinia 认证 Store。
 * @returns 无返回值。
 */
export function installRouteGuard(router: Router, authStore: RouteGuardAuthStore): void {
  router.beforeEach(createRouteGuard(authStore))
}
