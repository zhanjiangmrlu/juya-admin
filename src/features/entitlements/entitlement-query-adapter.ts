import type { ApiClient } from '@/services/api/api-client'
import type { components } from '@/shared/contracts/generated/admin-api'

type EntitlementPageDto = Omit<components['schemas']['EntitlementPageResponse'], 'items'> & {
  items: (components['schemas']['EntitlementListItemResponse'] & {
    juya_number?: string
    nickname?: string | null
    wechat_id?: string | null
    contact_status?: string
    contact_degraded?: boolean
    content_name?: string
    campaign_version_id?: string | null
    campaign_version_no?: number | null
    term?: string | null
    effective_at?: string | null
    start_deadline?: string | null
  })[]
}
type FormalDetailDto = components['schemas']['FormalEntitlementDetailResponse']
type LimitedDetailDto = components['schemas']['LimitedEntitlementDetailResponse']
type PackagePageDto = components['schemas']['PackagePageResponse']

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}
export interface EntitlementRow {
  id: string
  type: 'FORMAL' | 'LIMITED'
  userId: string
  status: string
  grantedAt: string
  expiresAt: string | null
  packageId: string | null
  campaignId: string | null
  juyaNumber?: string
  nickname?: string | null
  wechatId?: string | null
  contactStatus?: string
  contactDegraded?: boolean
  contentName?: string
  campaignVersionId?: string | null
  campaignVersionNo?: number | null
  term?: string | null
  effectiveAt?: string | null
  startDeadline?: string | null
}
export interface ContentPackage {
  id: string
  name: string
  status: string
  sortOrder: number
}
export interface FormalDetail {
  id: string
  userId: string
  packageId: string
  packageName: string
  status: string
  term: string
  grantedAt: string
  expiresAt: string | null
  version: number
  availableOperations: string[]
}
export interface LimitedDetail {
  id: string
  userId: string
  campaignVersionId: string
  campaignId: string
  campaignName: string
  status: string
  grantedAt: string
  startDeadline: string
  activatedAt: string | null
  expiresAt: string | null
  remedyCount: number
  version: number
  durationDays: number
  activationWindowDays: number
  sceneIds: string[]
  availableOperations: string[]
}
export interface EntitlementFilters {
  page: number
  pageSize?: number
  userId?: string
  type?: 'FORMAL' | 'LIMITED'
  status?: string
  packageId?: string
  campaignId?: string
  campaignVersionId?: string
  expiry?: 'EXPIRING' | 'ENDING' | 'START_EXPIRING'
  dateFrom?: string
  dateTo?: string
}
export interface EntitlementQueryAdapter {
  list(filters: EntitlementFilters): Promise<Page<EntitlementRow>>
  packages(page: number): Promise<Page<ContentPackage>>
  formal(id: string): Promise<FormalDetail>
  limited(id: string): Promise<LimitedDetail>
}

/**
 * 将生成契约隔离在 API 边界，并向页面提供稳定的驼峰模型。
 * @param client - 统一 API 客户端
 * @returns 权益查询适配器
 */
export function createEntitlementQueryAdapter(client: ApiClient): EntitlementQueryAdapter {
  return {
    async list(filters) {
      const dto = await client.request<EntitlementPageDto>({
        method: 'GET',
        path: '/api/v1/admin/entitlements',
        query: {
          page: filters.page,
          page_size: filters.pageSize ?? 20,
          ...(filters.userId ? { user_id: filters.userId } : {}),
          ...(filters.type ? { type: filters.type } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.packageId ? { package_id: filters.packageId } : {}),
          ...(filters.campaignVersionId ? { campaign_version_id: filters.campaignVersionId } : {}),
          ...(filters.expiry ? { expiry: filters.expiry } : {}),
          ...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
          ...(filters.dateTo ? { date_to: filters.dateTo } : {}),
          ...(filters.campaignId ? { campaign_id: filters.campaignId } : {})
        }
      })
      return {
        items: dto.items.map((item) => ({
          id: item.id,
          type: item.type,
          userId: item.user_id,
          status: item.status,
          grantedAt: item.granted_at,
          expiresAt: item.expires_at,
          packageId: item.package_id,
          campaignId: item.campaign_id,
          juyaNumber: item.juya_number,
          nickname: item.nickname,
          wechatId: item.wechat_id,
          contactStatus: item.contact_status,
          contactDegraded: item.contact_degraded,
          contentName: item.content_name,
          campaignVersionId: item.campaign_version_id,
          campaignVersionNo: item.campaign_version_no,
          term: item.term,
          effectiveAt: item.effective_at,
          startDeadline: item.start_deadline
        })),
        page: dto.page,
        pageSize: dto.page_size,
        total: dto.total
      }
    },
    async packages(page) {
      const dto = await client.request<PackagePageDto>({
        method: 'GET',
        path: '/api/v1/admin/content-packages',
        query: { page, page_size: 20 }
      })
      return {
        items: dto.items.map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
          sortOrder: item.sort_order
        })),
        page: dto.page,
        pageSize: dto.page_size,
        total: dto.total
      }
    },
    async formal(id) {
      const dto = await client.request<FormalDetailDto>({
        method: 'GET',
        path: `/api/v1/admin/formal-entitlements/${encodeURIComponent(id)}`
      })
      return {
        id: dto.id,
        userId: dto.user_id,
        packageId: dto.package_id,
        packageName: dto.package_name,
        status: dto.status,
        term: dto.term,
        grantedAt: dto.granted_at,
        expiresAt: dto.expires_at,
        version: dto.version,
        availableOperations: dto.available_operations
      }
    },
    async limited(id) {
      const dto = await client.request<LimitedDetailDto>({
        method: 'GET',
        path: `/api/v1/admin/limited-entitlements/${encodeURIComponent(id)}`
      })
      return {
        id: dto.id,
        userId: dto.user_id,
        campaignVersionId: dto.campaign_version_id,
        campaignId: dto.campaign_id,
        campaignName: dto.campaign_name,
        status: dto.status,
        grantedAt: dto.granted_at,
        startDeadline: dto.start_deadline,
        activatedAt: dto.activated_at,
        expiresAt: dto.expires_at,
        remedyCount: dto.remedy_count,
        version: dto.version,
        durationDays: dto.duration_days,
        activationWindowDays: dto.activation_window_days,
        sceneIds: dto.scene_ids,
        availableOperations: dto.available_operations
      }
    }
  }
}
