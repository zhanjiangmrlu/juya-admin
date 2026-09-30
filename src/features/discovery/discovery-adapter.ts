import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

type DiscoveryDto = components['schemas']['DiscoveryConfigResponse']

export interface DiscoveryConfigDraft {
  learningModules: Record<string, boolean>
  openSceneIds: string[]
  previewBySeries: Record<string, string[]>
}

export interface DiscoveryConfigSnapshot extends DiscoveryConfigDraft {
  version: number
}

export interface DiscoveryAdapter {
  load(): Promise<DiscoveryConfigSnapshot>
  save(draft: DiscoveryConfigDraft, expectedVersion: number): Promise<DiscoveryConfigSnapshot>
}

/**
 * 创建统一版本的发现页配置适配器
 *
 * @param client - 统一 API 客户端
 * @returns 发现页配置适配器
 */
export function createDiscoveryAdapter(client: ApiClient): DiscoveryAdapter {
  return {
    async load() {
      return mapConfig(
        await client.request<DiscoveryDto>({
          method: 'GET',
          path: '/api/v1/admin/content/discovery-config'
        })
      )
    },
    async save(draft, expectedVersion) {
      return mapConfig(
        await client.request<DiscoveryDto>({
          body: {
            expected_version: expectedVersion,
            learning_modules: draft.learningModules,
            open_scene_ids: draft.openSceneIds,
            preview_by_series: draft.previewBySeries
          },
          method: 'PUT',
          path: '/api/v1/admin/content/discovery-config'
        })
      )
    }
  }
}

/**
 * 将生成 DTO 映射为可编辑快照
 *
 * @param source - OpenAPI 生成的配置响应
 * @returns 可编辑配置快照
 */
function mapConfig(source: DiscoveryDto): DiscoveryConfigSnapshot {
  return {
    learningModules: { ...source.learning_modules },
    openSceneIds: [...source.open_scene_ids],
    previewBySeries: Object.fromEntries(
      Object.entries(source.preview_by_series).map(([seriesId, sceneIds]) => [
        seriesId,
        [...sceneIds]
      ])
    ),
    version: source.version
  }
}
