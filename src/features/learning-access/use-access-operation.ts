import { ref } from 'vue'

import { api, ApiError } from '@/services/http-client'

import type { components } from '@/shared/contracts/generated/admin-api'

/** 管理一次冻结确认的提交与未知回执恢复
 * @param path 已认证管理写接口
 * @param valid 判定回执是否为此操作的有效结果
 * @returns 本次提交及回执恢复状态
 */
export const useAccessOperation = <T>(path: string, valid: (value: T) => boolean) => {
  const busy = ref(false),
    unknown = ref(false),
    stale = ref(false),
    error = ref('')
  let key = '',
    body = { preview_token: '' }
  /** 绑定新核对快照，未知结果未解决时禁止替换
   * @param token 服务端核对凭据
   */
  const prepare = (token: string) => {
    if (unknown.value || busy.value) return
    key = crypto.randomUUID()
    body = { preview_token: token }
    stale.value = false
    error.value = ''
  }
  /** 查询同次结果，仅明确不存在时用原键及原正文重试
   * @returns 已确认结果，失败时为空
   */
  const submit = async (): Promise<T | null> => {
    if (busy.value || stale.value || !body.preview_token) return null
    busy.value = true
    error.value = ''
    try {
      let receipt: T | undefined
      if (unknown.value) {
        try {
          const value = await api.request<components['schemas']['OperationResponse']>(
            `/api/admin/v1/operations/${key}`
          )
          receipt = value.result as T
        } catch (reason) {
          if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
        }
      }
      receipt ??= await api.request<T>(path, { method: 'PUT', body, key })
      if (!valid(receipt)) throw new ApiError('response_unknown', '结果待确认，请查询原操作', 200)
      unknown.value = false
      return receipt
    } catch (reason) {
      unknown.value =
        !(reason instanceof ApiError) ||
        !reason.status ||
        reason.status >= 500 ||
        [408, 429].includes(reason.status) ||
        reason.code === 'response_unknown'
      stale.value = reason instanceof ApiError && [403, 404, 409, 422].includes(reason.status)
      error.value = reason instanceof Error ? reason.message : '结果待确认，请重试'
      return null
    } finally {
      busy.value = false
    }
  }
  return { busy, unknown, stale, error, prepare, submit }
}
