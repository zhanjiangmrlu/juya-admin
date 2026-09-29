import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

type PageDto = components['schemas']['CampaignPageResponse']
type DetailDto = components['schemas']['CampaignResponse']
type SaveDto = components['schemas']['CampaignSaveRequest']

export interface CampaignRow {
  id: string
  name: string
  status: string
  version: number
  currentVersionId: string | null
  capacity: number | null
  grantedUserCount: number | null
  createdAt: string
  updatedAt: string
  availableOperations: CampaignAction[]
}
export interface CampaignVersion {
  id: string
  versionNo: number
  status: string
  durationDays: number
  activationWindowDays: number
  capacity: number
  grantedUserCount: number
  grantStartsAt: string | null
  grantEndsAt: string | null
  lockedAt: string | null
  version: number
  sceneIds: string[]
}
export interface CampaignDetail {
  id: string
  name: string
  status: string
  version: number
  createdAt: string
  updatedAt: string
  currentVersion: CampaignVersion | null
  availableOperations: CampaignAction[]
}
export interface CampaignPage {
  items: CampaignRow[]
  page: number
  pageSize: number
  total: number
}
export interface CampaignDraft {
  name: string
  durationDays: 3 | 5
  activationWindowDays: number
  capacity: number
  sceneIds: string[]
}
export type CampaignOperation = 'open' | 'pause' | 'resume' | 'end' | 'archive' | 'capacity'
export type CampaignAction = CampaignOperation | 'copy'
export interface CampaignAdapter {
  list(page: number, status?: string): Promise<CampaignPage>
  detail(id: string): Promise<CampaignDetail>
  save(
    id: string | null,
    draft: CampaignDraft,
    expectedVersion: number | null,
    key: string
  ): Promise<CampaignDetail>
  copy(id: string, expectedVersion: number, key: string): Promise<CampaignDetail>
  command(
    id: string,
    operation: CampaignOperation,
    expectedVersion: number,
    key: string,
    capacity?: number
  ): Promise<CampaignDetail>
}

/**
 * 映射服务端活动详情。
 * @param dto - 生成契约中的活动详情
 * @returns 页面活动模型
 */
function mapDetail(dto: DetailDto): CampaignDetail {
  const version = dto.current_version
  return {
    id: dto.id,
    name: dto.name,
    status: dto.status,
    version: dto.version,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    currentVersion: version
      ? {
          id: version.id,
          versionNo: version.version_no,
          status: version.status,
          durationDays: version.duration_days,
          activationWindowDays: version.activation_window_days,
          capacity: version.capacity,
          grantedUserCount: version.granted_user_count,
          grantStartsAt: version.grant_starts_at,
          grantEndsAt: version.grant_ends_at,
          lockedAt: version.locked_at,
          version: version.version,
          sceneIds: version.scene_ids
        }
      : null,
    availableOperations: dto.available_operations ?? []
  }
}

/**
 * 基于实际 OpenAPI 路由创建活动适配器。
 * @param client - 统一 API 客户端
 * @returns 活动查询与命令适配器
 */
export function createCampaignAdapter(client: ApiClient): CampaignAdapter {
  return {
    async list(page, status) {
      const dto = await client.request<PageDto>({
        method: 'GET',
        path: '/api/v1/admin/campaigns',
        query: { page, page_size: 20, ...(status ? { status } : {}) }
      })
      return {
        items: dto.items.map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
          version: item.version,
          currentVersionId: item.current_version_id ?? null,
          capacity: item.capacity ?? null,
          grantedUserCount: item.granted_user_count ?? null,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          availableOperations: item.available_operations ?? []
        })),
        page: dto.page,
        pageSize: dto.page_size,
        total: dto.total
      }
    },
    async detail(id) {
      return mapDetail(
        await client.request<DetailDto>({
          method: 'GET',
          path: `/api/v1/admin/campaigns/${encodeURIComponent(id)}`
        })
      )
    },
    async save(id, draft, expectedVersion, key) {
      const body: SaveDto = {
        name: draft.name,
        duration_days: draft.durationDays,
        activation_window_days: draft.activationWindowDays,
        capacity: draft.capacity,
        scene_ids: draft.sceneIds,
        ...(expectedVersion === null ? {} : { expected_version: expectedVersion })
      }
      return mapDetail(
        await client.request<DetailDto>({
          body,
          idempotencyKey: key,
          method: id ? 'PUT' : 'POST',
          path: id ? `/api/v1/admin/campaigns/${encodeURIComponent(id)}` : '/api/v1/admin/campaigns'
        })
      )
    },
    async copy(id, expectedVersion, key) {
      return mapDetail(
        await client.request<DetailDto>({
          body: { expected_version: expectedVersion },
          idempotencyKey: key,
          method: 'POST',
          path: `/api/v1/admin/campaigns/${encodeURIComponent(id)}/versions/copy`
        })
      )
    },
    async command(id, operation, expectedVersion, key, capacity) {
      return mapDetail(
        await client.request<DetailDto>({
          body: {
            expected_version: expectedVersion,
            ...(capacity === undefined ? {} : { capacity })
          },
          idempotencyKey: key,
          method: 'POST',
          path: `/api/v1/admin/campaigns/${encodeURIComponent(id)}/commands/${operation}`
        })
      )
    }
  }
}
