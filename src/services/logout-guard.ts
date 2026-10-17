let current: (() => Promise<boolean>) | null = null

/** 注册当前编辑或排序页面的未保存保护
 * @param guard 离开前的明确选择
 * @returns 页面销毁时的注销函数
 */
export const registerLogoutGuard = (guard: () => Promise<boolean>) => {
  current = guard
  return () => {
    if (current === guard) current = null
  }
}

/** 注销会话前复用当前页面的离开确认
 * @returns 是否可以注销
 */
export const requestLogoutPermission = async () => (current ? current() : true)
