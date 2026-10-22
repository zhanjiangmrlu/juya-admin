import { ApiError } from '@/services/http-client'
import { FEEDBACK_OPERATION_PREFIX } from '@/shared/constants/feedback'

import type {
  FeedbackDetail,
  FeedbackMutationPorts,
  FeedbackReplyBody,
  FeedbackStatus
} from '@/shared/types/feedback'

interface FeedbackDraft {
  text: string
  status: '' | FeedbackStatus
}
const drafts = new Map<string, FeedbackDraft>()

/** 仅在当前页面进程中保存失效会话草稿，正文不进入浏览器持久存储
 * @param owner 已确认的原管理员编号
 * @param id 反馈编号
 * @param draft 当前输入，空值表示清除
 */
export const saveFeedbackDraft = (owner: string, id: string, draft: FeedbackDraft | null) => {
  const key = `${owner}:${id}`
  if (draft && (draft.text || draft.status)) drafts.set(key, { ...draft })
  else drafts.delete(key)
}

/** 登录确认身份后只取该管理员自己的内存草稿
 * @param owner 当前已确认的管理员编号
 * @param id 反馈编号
 * @returns 本人的草稿副本
 */
export const readFeedbackDraft = (owner: string, id: string) => {
  const draft = drafts.get(`${owner}:${id}`)
  return draft ? { ...draft } : null
}

/** 判断回执是否仍可能已在服务器提交
 * @param reason 写入收到的网络或业务错误
 * @returns 是否必须保留原操作标识并先查询
 */
export const feedbackOutcomeUnknown = (reason: unknown) =>
  !(reason instanceof ApiError) ||
  !reason.status ||
  reason.status >= 500 ||
  [408, 429].includes(reason.status) ||
  ['response_unknown', 'operation_conflict'].includes(reason.code)

/** 生成只指向管理员受控资源的图片地址
 * @param path 服务端签发的会话绑定截图地址
 * @returns 当前环境可请求的完整地址
 */
export const feedbackImageURL = (path: string) => {
  if (!path.startsWith('/api/admin/v1/feedback/')) throw new Error('截图地址暂不可用，请重新获取')
  return (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '') + path
}

/** 冻结同条回复，未知结果只保存无正文的本人操作元数据
 * @param id 当前反馈稳定编号
 * @param ports 本人身份、请求及会话元数据存储
 * @returns 查询、提交及待确认状态
 */
export const createFeedbackReply = (id: string, ports: FeedbackMutationPorts) => {
  const owner = ports.owner(),
    storageKey = `${FEEDBACK_OPERATION_PREFIX}${owner}:${id}`
  let key = ports.storage.getItem(storageKey) || '',
    frozen: FeedbackReplyBody | null = null,
    absent = false
  /** 防止页面失效后使用另一个管理员的身份提交或接收结果 */
  const assertOwner = () => {
    if (!owner || owner !== ports.owner())
      throw new ApiError('session_changed', '会话已变化，请重新打开反馈', 401)
  }
  /** 收到确定结果后移除原操作凭证和内存正文 */
  const clear = () => {
    ports.storage.removeItem(storageKey)
    key = ''
    frozen = null
    absent = false
  }
  /** 发送新回复或查询后明确重试原回复，绝不换键重复追加
   * @param body 本次管理员确认的文字及可选状态
   * @returns 服务端实际接受后的反馈详情
   */
  const send = async (body: FeedbackReplyBody) => {
    assertOwner()
    if (key && !absent) throw new Error('请先查询上次回复结果')
    key ||= crypto.randomUUID()
    frozen ||= structuredClone(body)
    ports.storage.setItem(storageKey, key)
    absent = false
    try {
      const value = await ports.request<FeedbackDetail>(
        `/api/admin/v1/feedback/${encodeURIComponent(id)}/messages`,
        { method: 'POST', key, body: frozen }
      )
      assertOwner()
      clear()
      return value
    } catch (reason) {
      if (
        !feedbackOutcomeUnknown(reason) &&
        !(reason instanceof ApiError && reason.code === 'session_changed')
      )
        clear()
      throw reason
    }
  }
  /** 先查询同一操作，未查到才允许用户明确用原键重试
   * @returns 已接受详情，或尚未查到的空结果
   */
  const recover = async () => {
    assertOwner()
    if (!key) return null
    try {
      const value = await ports.request<{ status: 'succeeded'; result: FeedbackDetail }>(
        `/api/admin/v1/operations/${encodeURIComponent(key)}`
      )
      assertOwner()
      clear()
      return value.result
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'operation_unknown') {
        assertOwner()
        absent = true
        return null
      }
      throw reason
    }
  }
  return {
    send,
    recover,
    pending: () => Boolean(key),
    canRetry: () => absent,
    hasBody: () => Boolean(frozen)
  }
}
