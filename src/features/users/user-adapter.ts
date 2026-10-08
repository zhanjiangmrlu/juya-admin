import type { ApiClient } from '@/services/api/api-client'

export interface UserProjectionDto {
  account_status: string
  contact: UserContactDto | null
  contact_degraded: boolean
  formal_entitlement_count: number
  last_active_at: string | null
  limited_entitlement_count: number
  open_feedback_count: number
  user_id: string
  juya_number?: string
  nickname?: string | null
  avatar_object_key?: string | null
  avatar_url?: string | null
  change_pending?: boolean
  contact_changed_at?: string | null
  open_scene_completed_count?: number | null
}

export type ContactStatus =
  'NOT_PROVIDED' | 'PENDING' | 'CONTACTED' | 'UNREACHABLE' | 'DO_NOT_CONTACT'

export interface UserContactDto {
  change_pending: boolean
  contact_status: ContactStatus
  updated_at: string
  verified_at: string | null
  verified_by: string | null
  verified_by_name?: string | null
  wechat_id: string | null
}

export interface UserDetailDto extends UserProjectionDto {
  records?: Record<string, Record<string, unknown>[]>
  favorite_count: number | null
  learning_days: number | null
  learning_degraded: boolean
  open_scene_completed_count: number | null
}

export interface UserSearchFilters {
  page?: number
  page_size?: number
  entitlement_type?: 'FORMAL' | 'LIMITED'
  entitlement_status?: string
  profile_completeness?: 'COMPLETE' | 'INCOMPLETE'
  cohort?: 'NEW_TODAY' | 'OPEN_WITHOUT_CONTACT'
}
export interface WechatSearchRequest extends UserSearchFilters {
  contact_status?: ContactStatus
  wechat_id: string
}

export interface UserAdapter {
  getUserDetail(userId: string, signal?: AbortSignal): Promise<UserDetailDto>
  searchByWechat(payload: WechatSearchRequest, signal?: AbortSignal): Promise<UserProjectionDto[]>
  searchUsers(
    query?: string,
    contactStatus?: ContactStatus,
    signal?: AbortSignal,
    filters?: UserSearchFilters
  ): Promise<UserProjectionDto[]>
}

/**
 * 创建用户列表、敏感搜索和详情接口适配器
 *
 * @param client - 统一 API 客户端
 * @returns 用户运营接口适配器
 */
export function createUserAdapter(client: ApiClient): UserAdapter {
  return {
    /**
     * 查询指定用户详情
     *
     * @param userId - 用户公开编号
     * @param signal - 可选请求取消信号
     * @returns 用户详情和联系方式降级标志
     */
    async getUserDetail(userId: string, signal?: AbortSignal): Promise<UserDetailDto> {
      const response = await client.request<unknown>({
        method: 'GET',
        path: `/api/v1/admin/users/${encodeURIComponent(userId)}`,
        signal
      })
      return parseUserDetail(response)
    },

    /**
     * 使用 POST 正文执行完整微信号搜索
     *
     * @param payload - 仅包含完整微信号的敏感请求体
     * @param signal - 可选请求取消信号
     * @returns 匹配的用户投影数组
     */
    async searchByWechat(
      payload: WechatSearchRequest,
      signal?: AbortSignal
    ): Promise<UserProjectionDto[]> {
      const response = await client.request<unknown>({
        body: payload,
        method: 'POST',
        path: '/api/v1/admin/users/search-by-wechat',
        signal
      })
      return parseUserList(response)
    },

    /**
     * 使用普通非敏感查询条件检索用户
     *
     * @param query - 用户编号等非敏感查询条件
     * @param contactStatus - 可选联系状态筛选
     * @param signal - 可选请求取消信号
     * @param filters - 服务端分页和运营筛选条件
     * @returns 匹配的用户投影数组
     */
    async searchUsers(
      query?: string,
      contactStatus?: ContactStatus,
      signal?: AbortSignal,
      filters?: UserSearchFilters
    ): Promise<UserProjectionDto[]> {
      const response = await client.request<unknown>({
        method: 'GET',
        path: '/api/v1/admin/users',
        query:
          query || contactStatus || filters
            ? { ...filters, contact_status: contactStatus, query: query || undefined }
            : undefined,
        signal
      })
      return parseUserList(response)
    }
  }
}

/**
 * 校验用户列表响应
 *
 * @param source - 接口返回的未知值
 * @returns 已校验的用户投影数组
 */
function parseUserList(source: unknown): UserProjectionDto[] {
  if (!Array.isArray(source)) throw new Error('用户列表接口响应格式不正确')
  return source.map(parseUserProjection)
}

/**
 * 校验用户详情响应
 *
 * @param source - 接口返回的未知值
 * @returns 已校验的用户详情
 */
function parseUserDetail(source: unknown): UserDetailDto {
  if (!isRecord(source)) throw new Error('用户详情接口响应格式不正确')
  return {
    ...parseUserProjection(source),
    records: isRecord(source.records)
      ? (source.records as Record<string, Record<string, unknown>[]>)
      : {},
    favorite_count: requireNullableNumber(source, 'favorite_count'),
    learning_days: requireNullableNumber(source, 'learning_days'),
    learning_degraded: requireBoolean(source, 'learning_degraded'),
    open_scene_completed_count: requireNullableNumber(source, 'open_scene_completed_count')
  }
}

/**
 * 校验单个用户投影
 *
 * @param source - 用户数组中的未知元素
 * @returns 字段完整的用户投影
 */
function parseUserProjection(source: unknown): UserProjectionDto {
  if (!isRecord(source)) throw new Error('用户接口响应格式不正确')
  const contactSource = source.contact
  let contact: UserContactDto | null = null
  if (contactSource !== null && contactSource !== undefined) {
    if (!isRecord(contactSource)) throw new Error('用户联系方式响应格式不正确')
    contact = {
      change_pending: requireBoolean(contactSource, 'change_pending'),
      contact_status: requireContactStatus(contactSource, 'contact_status'),
      updated_at: requireString(contactSource, 'updated_at'),
      verified_at: requireNullableString(contactSource, 'verified_at'),
      verified_by: requireNullableString(contactSource, 'verified_by'),
      verified_by_name:
        typeof contactSource.verified_by_name === 'string' ? contactSource.verified_by_name : null,
      wechat_id: requireNullableString(contactSource, 'wechat_id')
    }
  }
  return {
    juya_number: typeof source.juya_number === 'string' ? source.juya_number : undefined,
    nickname: typeof source.nickname === 'string' ? source.nickname : null,
    avatar_object_key:
      typeof source.avatar_object_key === 'string' ? source.avatar_object_key : null,
    avatar_url: typeof source.avatar_url === 'string' ? source.avatar_url : null,
    change_pending: source.change_pending === true,
    contact_changed_at:
      typeof source.contact_changed_at === 'string' ? source.contact_changed_at : null,
    open_scene_completed_count:
      typeof source.open_scene_completed_count === 'number'
        ? source.open_scene_completed_count
        : null,
    account_status: requireString(source, 'account_status'),
    contact,
    contact_degraded: requireBoolean(source, 'contact_degraded'),
    formal_entitlement_count: requireNumber(source, 'formal_entitlement_count'),
    last_active_at: source.last_active_at === null ? null : requireString(source, 'last_active_at'),
    limited_entitlement_count: requireNumber(source, 'limited_entitlement_count'),
    open_feedback_count: requireNumber(source, 'open_feedback_count'),
    user_id: requireString(source, 'user_id')
  }
}

/**
 * 从接口对象读取必需字符串
 *
 * @param source - 接口响应对象
 * @param key - 字符串字段名
 * @returns 非空字符串字段值
 */
function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`用户接口缺少字段：${key}`)
  return value
}

/**
 * 从接口对象读取有限数字
 *
 * @param source - 接口响应对象
 * @param key - 数字字段名
 * @returns 有限数字字段值
 */
function requireNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`用户接口缺少数字字段：${key}`)
  }
  return value
}

/**
 * 读取可空数字字段。
 * @param source - 接口响应对象
 * @param key - 字段名
 * @returns 数字或空值
 */
function requireNullableNumber(source: Record<string, unknown>, key: string): number | null {
  if (source[key] === null) return null
  return requireNumber(source, key)
}

/**
 * 读取可空字符串字段。
 * @param source - 接口响应对象
 * @param key - 字段名
 * @returns 字符串或空值
 */
function requireNullableString(source: Record<string, unknown>, key: string): string | null {
  if (source[key] === null) return null
  return requireString(source, key)
}

/**
 * 读取并校验五种联系状态。
 * @param source - 接口响应对象
 * @param key - 字段名
 * @returns 合法联系状态
 */
function requireContactStatus(source: Record<string, unknown>, key: string): ContactStatus {
  const value = requireString(source, key)
  if (
    value !== 'NOT_PROVIDED' &&
    value !== 'PENDING' &&
    value !== 'CONTACTED' &&
    value !== 'UNREACHABLE' &&
    value !== 'DO_NOT_CONTACT'
  ) {
    throw new Error(`用户接口联系状态无效：${value}`)
  }
  return value
}

/**
 * 从接口对象读取布尔值
 *
 * @param source - 接口响应对象
 * @param key - 布尔字段名
 * @returns 布尔字段值
 */
function requireBoolean(source: Record<string, unknown>, key: string): boolean {
  const value = source[key]
  if (typeof value !== 'boolean') throw new Error(`用户接口缺少布尔字段：${key}`)
  return value
}

/**
 * 判断未知值是否为记录对象
 *
 * @param value - 需要判断的未知值
 * @returns 值是否为非空且非数组的对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
