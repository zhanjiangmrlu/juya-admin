import { type Ref, ref } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type {
  ContactStatus,
  UserAdapter,
  UserProjectionDto,
  WechatSearchRequest
} from './user-adapter'
import type { UserPageState } from './user-model'
import type { Router } from 'vue-router'

export interface UserListController {
  dispose(): void
  error: Ref<string | null>
  search(query?: string, contactStatus?: ContactStatus): Promise<void>
  searchByWechat(value: string): Promise<void>
  state: Ref<UserPageState>
  users: Ref<UserProjectionDto[]>
}

/**
 * 创建用户列表查询与敏感搜索控制器
 *
 * @param adapter - 用户接口适配器
 * @param router - 用于同步非敏感筛选标记的路由器
 * @returns 用户列表响应式控制器
 */
export function useUserList(adapter: UserAdapter, router: Router): UserListController {
  const error = ref<string | null>(null)
  const state = ref<UserPageState>('idle')
  const users = ref<UserProjectionDto[]>([])
  let abortController: AbortController | null = null
  let requestSequence = 0

  /**
   * 执行普通非敏感用户搜索并同步 URL query
   *
   * @param query - 用户编号等普通搜索条件
   * @param contactStatus - 可选联系状态筛选
   * @returns 搜索完成后的 Promise
   */
  async function search(query = '', contactStatus?: ContactStatus): Promise<void> {
    const normalizedQuery = query.trim()
    await runSearch(
      (signal) => adapter.searchUsers(normalizedQuery || undefined, contactStatus, signal),
      {
        ...(normalizedQuery ? { query: normalizedQuery } : {}),
        ...(contactStatus ? { contact_status: contactStatus } : {})
      }
    )
  }

  /**
   * 执行完整微信号 POST 搜索且仅在 URL 记录布尔标记
   *
   * @param value - 完整微信号输入值
   * @returns 搜索完成后的 Promise；输入无效时不发请求
   */
  async function searchByWechat(value: string): Promise<void> {
    try {
      const payload = createSensitiveSearchPayload(value)
      await runSearch((signal) => adapter.searchByWechat(payload, signal), {
        hasSensitiveSearch: 'true'
      })
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '微信号格式不正确'
      state.value = 'error'
    }
  }

  /**
   * 取消旧请求并执行新的列表查询
   *
   * @param request - 接收取消信号并返回用户数组的请求函数
   * @param query - 查询完成后写入 URL 的非敏感参数
   * @returns 查询和路由同步完成后的 Promise
   */
  async function runSearch(
    request: (signal: AbortSignal) => Promise<UserProjectionDto[]>,
    query: Record<string, string>
  ): Promise<void> {
    abortController?.abort()
    abortController = new AbortController()
    const currentSequence = ++requestSequence
    error.value = null
    state.value = 'loading'
    try {
      const result = await request(abortController.signal)
      if (currentSequence !== requestSequence) return
      users.value = result
      state.value = result.length === 0 ? 'empty' : 'success'
      await router.replace({ query })
    } catch (reason) {
      if (currentSequence !== requestSequence || isAbortError(reason)) return
      error.value = reason instanceof ApiError ? reason.message : '用户数据加载失败，请稍后重试'
      state.value = 'error'
    }
  }

  /**
   * 取消页面离开时仍在进行的用户查询
   *
   * @returns 无返回值
   */
  function dispose(): void {
    abortController?.abort()
  }

  return { dispose, error, search, searchByWechat, state, users }
}

/**
 * 校验完整微信号并创建敏感搜索请求体
 *
 * @param value - 管理员输入的完整微信号
 * @returns 只用于 POST 正文的微信号搜索对象
 */
export function createSensitiveSearchPayload(value: string): WechatSearchRequest {
  if (value.length === 0) throw new Error('请输入完整微信号')
  if (value.trim() !== value || /\s/.test(value)) throw new Error('微信号不能包含空格')
  if (value.length > 64) throw new Error('微信号不能超过 64 个字符')
  return { wechat_id: value }
}

/**
 * 判断未知异常是否为浏览器取消请求异常
 *
 * @param error - 捕获到的未知异常
 * @returns 异常是否为 AbortError
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
