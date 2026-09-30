import type { SceneFilters, ScenePage, SceneRevision, SceneSummary } from './content-model'
import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

type SceneDto = components['schemas']['SceneResponse']
type ScenePageDto = components['schemas']['ScenePageResponse']
type RevisionDto = components['schemas']['RevisionResponse']

export interface ContentAdapter {
  createRevision(sceneId: string, sourceRevisionId: null | string): Promise<SceneRevision>
  getRevision(revisionId: string): Promise<SceneRevision>
  getScene(sceneId: string): Promise<SceneSummary>
  listScenes(filters: SceneFilters, signal?: AbortSignal): Promise<ScenePage>
  offline(sceneId: string, idempotencyKey: string): Promise<void>
  saveRevision(
    revisionId: string,
    expectedVersion: number,
    content: Record<string, unknown>
  ): Promise<SceneRevision>
}

/**
 * 创建内容目录与版本编辑适配器
 *
 * @param client - 统一 API 客户端
 * @returns 内容目录与版本适配器
 */
export function createContentAdapter(client: ApiClient): ContentAdapter {
  return {
    async createRevision(sceneId, sourceRevisionId) {
      const response = await client.request<RevisionDto>({
        body: { source_revision_id: sourceRevisionId },
        method: 'POST',
        path: `/api/v1/admin/content/scenes/${encodeURIComponent(sceneId)}/revisions`
      })
      return mapRevision(response)
    },
    async getRevision(revisionId) {
      const response = await client.request<RevisionDto>({
        method: 'GET',
        path: `/api/v1/admin/content/revisions/${encodeURIComponent(revisionId)}`
      })
      return mapRevision(response)
    },
    async getScene(sceneId) {
      const response = await client.request<SceneDto>({
        method: 'GET',
        path: `/api/v1/admin/content/scenes/${encodeURIComponent(sceneId)}`
      })
      return mapScene(response)
    },
    async listScenes(filters, signal) {
      const response = await client.request<ScenePageDto>({
        method: 'GET',
        path: '/api/v1/admin/content/scenes',
        query: {
          page: filters.page,
          page_size: filters.pageSize,
          query: filters.query || undefined,
          series_id: filters.seriesId || undefined,
          status: filters.status || undefined
        },
        signal
      })
      return {
        items: response.items.map(mapScene),
        page: response.page,
        pageSize: response.page_size,
        total: response.total
      }
    },
    async offline(sceneId, idempotencyKey) {
      await client.request<void>({
        idempotencyKey,
        method: 'POST',
        path: `/api/v1/admin/content/scenes/${encodeURIComponent(sceneId)}/commands/offline`
      })
    },
    async saveRevision(revisionId, expectedVersion, content) {
      const response = await client.request<RevisionDto>({
        body: { content, expected_version: expectedVersion },
        method: 'PUT',
        path: `/api/v1/admin/content/revisions/${encodeURIComponent(revisionId)}`
      })
      return mapRevision(response)
    }
  }
}

/**
 * 将生成的场景 DTO 映射为页面模型
 *
 * @param source - OpenAPI 生成的场景响应
 * @returns 页面使用的场景摘要
 */
function mapScene(source: SceneDto): SceneSummary {
  return {
    coverObjectKey: source.cover_object_key,
    draftRevisionId: source.draft_revision_id,
    id: source.id,
    publishedRevisionId: source.published_revision_id,
    seriesId: source.series_id,
    seriesTitle: source.series_title,
    status: source.status as SceneSummary['status'],
    summary: source.summary,
    title: source.title,
    updatedAt: source.updated_at
  }
}

/**
 * 将生成的 revision DTO 映射为页面模型
 *
 * @param source - OpenAPI 生成的版本响应
 * @returns 页面使用的内容版本
 */
function mapRevision(source: RevisionDto): SceneRevision {
  return {
    content: { ...source.content },
    createdAt: source.created_at,
    createdBy: source.created_by,
    id: source.id,
    sceneId: source.scene_id,
    sourceRevisionId: source.source_revision_id,
    stableEntryIds: [...source.stable_entry_ids],
    stableSentenceIds: [...source.stable_sentence_ids],
    status: source.status,
    version: source.version
  }
}
