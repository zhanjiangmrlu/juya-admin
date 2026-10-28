import { api, ApiError } from '@/services/http-client'

export const listeningBase = '/api/admin/v1/listening'
/** 读取或写入独立听读子域，复用既有会话和幂等请求
 * @param path 子域相对路径
 * @param options 请求正文、方法及稳定操作键
 * @returns 服务端真实结果
 */
export const listeningRequest = <T>(path: string, options?: Parameters<typeof api.request>[1]) =>
  api.request<T>(`${listeningBase}${path}`, options)
/** 冻结一次听读写入，未知响应以同一幂等键恢复
 * @param method 写入HTTP方法
 * @param path 听读相对路径
 * @param body 本次固定的请求内容
 * @returns 可安全重试的同一请求
 */
export const listeningOperation = <T>(method: string, path: string, body?: unknown) =>
  api.operation<T>(
    method,
    `${listeningBase}${path}`,
    body === undefined || body instanceof FormData ? body : JSON.parse(JSON.stringify(body))
  )
/** 保留创建/编辑的原键与冻结正文，未知后先查回执再恢复原请求
 * @param method 本次明确的写方法
 * @param path 听读对象的相对路径
 * @param body 管理员本次确认的固定正文
 * @returns 可查询后重试的固定操作和未知状态
 */
export const listeningRecoverableOperation = <T>(method: string, path: string, body: unknown) => {
  const key = crypto.randomUUID(),
    frozen = JSON.parse(JSON.stringify(body)) as unknown
  let unknown = false
  /** 查询原操作回执，查无结果时只发送原键和原正文
   * @returns 原请求已确认的结果
   */
  const run = async (): Promise<T> => {
    if (unknown) {
      try {
        const receipt = await api.request<{ result: T }>(
          `/api/admin/v1/operations/${encodeURIComponent(key)}`
        )
        unknown = false
        return receipt.result
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.code !== 'operation_unknown') throw reason
      }
    }
    try {
      const result = await listeningRequest<T>(path, { method, body: frozen, key })
      unknown = false
      return result
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        (['network_unknown', 'response_unknown'].includes(reason.code) || reason.status >= 500)
      )
        unknown = true
      throw reason
    }
  }
  return {
    run,
    get unknown() {
      return unknown
    }
  }
}
/** 创建管理员受控全文媒体地址
 * @param articleId 文章稳定编号
 * @param mediaId 已保存素材编号
 * @returns 需要现有管理员会话的资源地址
 */
export const listeningMediaURL = (articleId: string, mediaId: string | null) =>
  mediaId
    ? `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}${listeningBase}/articles/${encodeURIComponent(articleId)}/media/${encodeURIComponent(mediaId)}`
    : ''
/** 供已暂存但尚未创建文章的候选使用独立受控资源
 * @param batchId 当前管理员拥有的批次编号
 * @returns 批次媒体前缀
 */
export const listeningImportMediaBase = (batchId: string) =>
  `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}${listeningBase}/imports/${encodeURIComponent(batchId)}/media`
