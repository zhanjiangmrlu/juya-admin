import type { ApiClient } from '@/services/api/api-client'

export interface PublishCheckResult {
  errorCodes: readonly string[]
  ready: boolean
  warningCodes: readonly string[]
}

export interface PublishInput {
  acknowledgedWarningCodes: string[]
  revisionId: string
}

export interface PublishAdapter {
  check(revisionId: string, acknowledgedWarningCodes: string[]): Promise<PublishCheckResult>
  offline(sceneId: string): Promise<void>
  publish(input: PublishInput, idempotencyKey: string): Promise<Record<string, unknown>>
}

/**
 * 创建发布检查、发布和下线接口适配器
 *
 * @param client - 统一 API 客户端
 * @returns 内容发布适配器
 */
export function createPublishAdapter(client: ApiClient): PublishAdapter {
  return {
    /**
     * 执行服务端发布检查
     *
     * @param revisionId - 内容版本编号
     * @param acknowledgedWarningCodes - 已确认警告码
     * @returns 已校验的发布检查结果
     */
    async check(revisionId, acknowledgedWarningCodes) {
      const response = await client.request<Record<string, unknown>>({
        body: { acknowledged_warning_codes: acknowledgedWarningCodes },
        method: 'POST',
        path: `/api/v1/admin/content/revisions/${encodeURIComponent(revisionId)}/publish-checks`
      })
      return parseCheck(response)
    },
    /**
     * 下线指定场景
     *
     * @param sceneId - 场景编号
     * @returns 下线完成后的 Promise
     */
    async offline(sceneId) {
      await client.request<void>({
        method: 'POST',
        path: `/api/v1/admin/content/scenes/${encodeURIComponent(sceneId)}/commands/offline`
      })
    },
    /**
     * 发布已通过检查的内容版本
     *
     * @param input - 版本编号和已确认警告
     * @param idempotencyKey - 当前逻辑操作的幂等键
     * @returns 服务端发布结果
     */
    async publish(input, idempotencyKey) {
      return client.request<Record<string, unknown>>({
        body: { acknowledged_warning_codes: input.acknowledgedWarningCodes },
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/content/revisions/${encodeURIComponent(input.revisionId)}/commands/publish`
      })
    }
  }
}

/**
 * 校验并映射发布检查响应
 *
 * @param source - 服务端发布检查响应
 * @returns 发布检查结果
 */
function parseCheck(source: Record<string, unknown>): PublishCheckResult {
  if (
    typeof source.ready !== 'boolean' ||
    !isStringArray(source.error_codes) ||
    !isStringArray(source.warning_codes)
  )
    throw new Error('发布检查响应格式不正确')
  return {
    errorCodes: source.error_codes,
    ready: source.ready,
    warningCodes: source.warning_codes
  }
}

/**
 * 判断未知值是否为字符串数组
 *
 * @param value - 需要判断的未知值
 * @returns 是否为字符串数组
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
