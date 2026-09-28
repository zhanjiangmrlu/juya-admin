import { type MaybeRef, type Ref, ref, toValue } from 'vue'

import { ApiError } from '@/shared/errors/api-error'

import type { UserAdapter, UserDetailDto } from './user-adapter'
import type { UserPageState, UserSectionState } from './user-model'

export interface UserDetailSectionStates {
  basic: UserSectionState
  contact: UserSectionState
  entitlements: UserSectionState
  feedback: UserSectionState
  learning: UserSectionState
}

export interface UserDetailController {
  detail: Ref<UserDetailDto | null>
  dispose(): void
  error: Ref<string | null>
  load(): Promise<void>
  sectionStates: Ref<UserDetailSectionStates>
  state: Ref<UserPageState>
}

const initialSections: UserDetailSectionStates = {
  basic: 'pending',
  contact: 'pending',
  entitlements: 'pending',
  feedback: 'pending',
  learning: 'pending'
}

/**
 * 创建用户详情控制器并保持各业务区块独立状态。
 *
 * @param adapter - 用户接口适配器。
 * @param userId - 用户公开编号或响应式编号。
 * @returns 用户详情响应式控制器。
 */
export function useUserDetail(
  adapter: UserAdapter,
  userId: MaybeRef<string>
): UserDetailController {
  const detail = ref<UserDetailDto | null>(null)
  const error = ref<string | null>(null)
  const sectionStates = ref<UserDetailSectionStates>({ ...initialSections })
  const state = ref<UserPageState>('idle')
  let abortController: AbortController | null = null

  /**
   * 加载当前用户详情并分别计算区块状态。
   *
   * @returns 详情加载完成后的 Promise。
   */
  async function load(): Promise<void> {
    abortController?.abort()
    abortController = new AbortController()
    state.value = 'loading'
    error.value = null
    try {
      const result = await adapter.getUserDetail(toValue(userId), abortController.signal)
      detail.value = result
      sectionStates.value = {
        basic: 'success',
        contact: result.contact_degraded ? 'error' : 'success',
        entitlements: 'success',
        feedback: 'success',
        learning: 'pending'
      }
      state.value = 'success'
    } catch (reason) {
      if (isAbortError(reason)) return
      error.value = reason instanceof ApiError ? reason.message : '用户详情加载失败，请稍后重试'
      state.value = 'error'
    }
  }

  /**
   * 取消页面离开时仍在进行的详情请求。
   *
   * @returns 无返回值。
   */
  function dispose(): void {
    abortController?.abort()
  }

  return { detail, dispose, error, load, sectionStates, state }
}

/**
 * 判断未知异常是否为浏览器取消请求异常。
 *
 * @param error - 捕获到的未知异常。
 * @returns 异常是否为 AbortError。
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
