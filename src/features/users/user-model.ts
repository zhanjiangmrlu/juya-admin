export type UserPageState = 'empty' | 'error' | 'idle' | 'loading' | 'success'
export type UserSectionState = 'error' | 'pending' | 'success'

/**
 * 返回账户状态对应的中文文案。
 *
 * @param status - 后端账户状态值。
 * @returns 可展示的账户状态文案。
 */
export function getAccountStatusLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = {
    ACTIVE: '正常',
    DELETED: '已注销',
    DISABLED: '已停用'
  }
  return labels[status] ?? status
}

/**
 * 返回账户状态对应的视觉语义。
 *
 * @param status - 后端账户状态值。
 * @returns Element Plus 状态标签语义。
 */
export function getAccountStatusTone(status: string): 'danger' | 'info' | 'success' {
  if (status === 'ACTIVE') return 'success'
  if (status === 'DISABLED') return 'danger'
  return 'info'
}
