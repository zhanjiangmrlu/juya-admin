import type { ApiClient } from '@/services/api/api-client'

export interface DiscoveryAdapter {
  replaceOpenScenes(sceneIds: string[]): Promise<Record<string, unknown>>
  replacePreviewScenes(seriesId: string, sceneIds: string[]): Promise<Record<string, unknown>>
}

/**
 * 创建开放场景与系列预览配置适配器
 *
 * @param client - 统一 API 客户端
 * @returns 发现页配置适配器
 */
export function createDiscoveryAdapter(client: ApiClient): DiscoveryAdapter {
  return {
    /**
     * 替换三个开放场景
     *
     * @param sceneIds - 三个开放场景编号
     * @returns 服务端配置结果
     */
    async replaceOpenScenes(sceneIds) {
      return client.request<Record<string, unknown>>({
        body: { scene_ids: sceneIds },
        method: 'PUT',
        path: '/api/v1/admin/content/open-scenes'
      })
    },
    /**
     * 替换指定系列的预览场景
     *
     * @param seriesId - 系列编号
     * @param sceneIds - 预览场景编号
     * @returns 服务端配置结果
     */
    async replacePreviewScenes(seriesId, sceneIds) {
      return client.request<Record<string, unknown>>({
        body: { scene_ids: sceneIds },
        method: 'PUT',
        path: `/api/v1/admin/content/preview-configs/${encodeURIComponent(seriesId)}`
      })
    }
  }
}
