import { getCapability } from '@/shared/capabilities/capability-registry'

import type { ApiClient } from '@/services/api/api-client'

export interface ContentAdapter {
  createRevision(sceneId: string, sourceRevisionId: string | null): Promise<Record<string, unknown>>
  listState: 'available' | 'pending'
  offline(sceneId: string, idempotencyKey: string): Promise<void>
  requestCount: number
}

/**
 * 创建内容版本操作适配器
 *
 * @param client - 统一 API 客户端
 * @returns 内容版本适配器
 */
export function createContentAdapter(client: ApiClient): ContentAdapter {
  return {
    /**
     * 创建新的场景草稿版本
     *
     * @param sceneId - 场景编号
     * @param sourceRevisionId - 可选来源版本编号
     * @returns 服务端返回的新版本对象
     */
    async createRevision(sceneId, sourceRevisionId) {
      return client.request<Record<string, unknown>>({
        body: { source_revision_id: sourceRevisionId },
        method: 'POST',
        path: `/api/v1/admin/content/scenes/${encodeURIComponent(sceneId)}/revisions`
      })
    },
    listState: getCapability('content.list'),
    /**
     * 下线指定已发布场景
     *
     * @param sceneId - 场景编号
     * @param idempotencyKey - 当前逻辑操作的幂等键
     * @returns 下线完成后的 Promise
     */
    async offline(sceneId, idempotencyKey) {
      await client.request<void>({
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/content/scenes/${encodeURIComponent(sceneId)}/commands/offline`
      })
    },
    requestCount: 0
  }
}
