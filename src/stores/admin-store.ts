import { defineStore } from 'pinia'
import { ref } from 'vue'

import { clearClientThumbnails } from '@/services/client-thumbnail'
import { api, ApiError } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'

export const useAdminStore = defineStore('administrator', () => {
  const identity = ref<components['schemas']['AdministratorIdentity'] | null>(null)
  const checked = ref(false)
  /** 清理失效身份和含个人资料的界面状态 */
  const clear = () => {
    clearClientThumbnails()
    identity.value = null
    checked.value = true
  }
  /** 启动时仅恢复已有 Cookie，不自动登录
   * @returns 恢复结果
   */
  const resume = async () => {
    try {
      identity.value = await api.resume()
      checked.value = true
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) clear()
      else throw error
    }
  }
  /** 明确提交管理员账号密码
   * @param body 当前输入的凭证
   */
  const login = async (body: components['schemas']['AdminLogin']) => {
    identity.value = await api.login(body)
    clearClientThumbnails()
    checked.value = true
  }
  /** 注销服务器会话，成功后清理本地身份 */
  const logout = async () => {
    await api.request('/api/admin/v1/auth/logout', { method: 'POST' })
    clear()
  }
  return { identity, checked, clear, resume, login, logout }
})
