export const /**
   * 展示真实管理员账号名，并明确系统与无法解析的历史身份
   * @param id - 操作记录中的管理员身份标识
   * @param name - 服务端解析出的管理员账号名
   * @returns 操作人展示文案
   */
  formatAdminActor = (id: unknown, name?: unknown): string => {
    if (typeof name === 'string' && name.trim()) return name.trim()
    if (id === 'system') return '系统'
    return id === null || id === undefined || String(id).trim() === ''
      ? '未知操作人'
      : `未知操作人（ID：${String(id)}）`
  }
