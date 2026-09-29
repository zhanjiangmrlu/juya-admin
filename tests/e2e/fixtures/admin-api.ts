import { expect, test as base } from '@playwright/test'

import type { Page, Route } from '@playwright/test'

export interface ApiRequestRecord {
  body: unknown
  headers: Record<string, string>
  method: string
  pathname: string
  url: string
}

export interface AdminApiMock {
  conflictOnNextCampaignSave(): void
  setCampaignStatus(status: 'DRAFT' | 'OPEN'): void
  conflictOnNextContactDecision(): void
  conflictOnNextSettingsUpdate(): void
  findRequest(method: string, pathname: string): ApiRequestRecord | undefined
  requests: ApiRequestRecord[]
  unexpectedRequests: ApiRequestRecord[]
  unauthorizedPaths: Set<string>
}

interface AdminApiState extends AdminApiMock {
  campaignConflictPending: boolean
  campaignVersion: number
  campaignCapacity: number
  campaignGrantedCount: number
  campaignName: string
  campaignStatus: 'DRAFT' | 'OPEN' | 'PAUSED' | 'ENDED' | 'ARCHIVED' | 'CLOSED'
  campaignVersionStatus: string
  campaignVersionNo: number
  campaignVersionRevision: number
  campaignDuration: number
  campaignWindow: number
  campaignScenes: string[]
  contactDecisionConflictPending: boolean
  contactCorrectionStatus: 'APPROVED' | 'PENDING' | 'REJECTED'
  feedbackStatus: string
  settingsConflictPending: boolean
  settingsVersion: number
  supplementRounds: number
}

export const test = base.extend<{ adminApi: AdminApiMock }>({
  adminApi: async ({ page }, use) => {
    const state: AdminApiState = {
      conflictOnNextCampaignSave() {
        state.campaignConflictPending = true
      },
      setCampaignStatus(status) {
        state.campaignStatus = status
        state.campaignVersionStatus = status
      },
      conflictOnNextContactDecision() {
        state.contactDecisionConflictPending = true
      },
      conflictOnNextSettingsUpdate() {
        state.settingsConflictPending = true
      },
      findRequest(method, pathname) {
        return state.requests.find(
          (request) => request.method === method && request.pathname === pathname
        )
      },
      contactCorrectionStatus: 'PENDING',
      campaignConflictPending: false,
      campaignVersion: 3,
      campaignCapacity: 30,
      campaignGrantedCount: 5,
      campaignName: '秋季限时学习',
      campaignStatus: 'OPEN',
      campaignVersionStatus: 'OPEN',
      campaignVersionNo: 1,
      campaignVersionRevision: 1,
      campaignDuration: 3,
      campaignWindow: 7,
      campaignScenes: ['SCENE-1'],
      contactDecisionConflictPending: false,
      feedbackStatus: 'PROCESSING',
      requests: [],
      unexpectedRequests: [],
      settingsConflictPending: false,
      settingsVersion: 3,
      supplementRounds: 0,
      unauthorizedPaths: new Set<string>()
    }
    await installAdminApiRoutes(page, state)
    await use(state)
  }
})

export { expect }

/**
 * 通过真实登录页建立测试会话
 *
 * @param page - Playwright 页面
 * @returns 登录完成后的 Promise
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill('admin')
  await page.getByLabel('密码').fill('Admin-pass-2026')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

/**
 * 在不重载页面的情况下切换 Vue Router 地址
 *
 * @param page - Playwright 页面
 * @param path - 目标站内路径
 * @returns 路由切换完成后的 Promise
 */
export async function navigateInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`))
}

/**
 * 安装覆盖管理端已实现接口的确定性网络夹具
 *
 * @param page - Playwright 页面
 * @param state - 可由测试调整的接口状态
 * @returns 路由注册完成后的 Promise
 */
async function installAdminApiRoutes(page: Page, state: AdminApiState): Promise<void> {
  await page.route('**/api/v1/admin/**', async (route) => handleAdminRequest(route, state))
}

/**
 * 记录并响应单个管理端接口请求
 *
 * @param route - Playwright 路由请求
 * @param state - 当前接口夹具状态
 * @returns 请求响应完成后的 Promise
 */
async function handleAdminRequest(route: Route, state: AdminApiState): Promise<void> {
  const request = route.request()
  const url = new URL(request.url())
  const record: ApiRequestRecord = {
    body: readRequestBody(request.postData()),
    headers: request.headers(),
    method: request.method(),
    pathname: url.pathname,
    url: request.url()
  }
  state.requests.push(record)

  if (state.unauthorizedPaths.has(url.pathname)) {
    await replyJson(
      route,
      { code: 'SESSION_EXPIRED', message: '登录状态已失效', request_id: 'e2e-401' },
      401
    )
    return
  }

  if (url.pathname === '/api/v1/admin/session' && request.method() === 'POST') {
    await replyJson(route, { csrf_token: 'csrf-e2e', expires_at: '2026-09-29T20:00:00Z' })
    return
  }
  if (url.pathname === '/api/v1/admin/session' && request.method() === 'GET') {
    await replyJson(route, { csrf_token: 'csrf-e2e', expires_at: '2026-09-29T20:00:00Z' })
    return
  }
  if (url.pathname === '/api/v1/admin/session/logout') {
    await route.fulfill({ status: 204 })
    return
  }
  if (url.pathname === '/api/v1/admin/settings' && request.method() === 'GET') {
    await replyJson(route, createSettingsResponse(state.settingsVersion))
    return
  }
  if (url.pathname.startsWith('/api/v1/admin/settings/') && request.method() === 'PATCH') {
    if (state.settingsConflictPending) {
      state.settingsConflictPending = false
      state.settingsVersion = 4
      await replyJson(
        route,
        { code: 'CONFIG_VERSION_CONFLICT', message: '配置版本冲突', request_id: 'e2e-409' },
        409
      )
      return
    }
    await replyJson(route, {
      key: decodeURIComponent(url.pathname.split('/').at(-1) ?? ''),
      value: (record.body as { value?: Record<string, unknown> } | null)?.value ?? { value: true },
      version: state.settingsVersion + 1
    })
    return
  }
  if (url.pathname === '/api/v1/admin/audit-events') {
    await replyJson(route, { items: [auditEvent] })
    return
  }
  if (url.pathname === '/api/v1/admin/dashboard') {
    await replyJson(route, dashboardSnapshot)
    return
  }
  if (url.pathname === '/api/v1/admin/work-items') {
    await replyJson(route, [])
    return
  }
  if (url.pathname === '/api/v1/admin/users/search-by-wechat') {
    await replyJson(route, [userProjection])
    return
  }
  if (url.pathname === '/api/v1/admin/users/USER-1' && request.method() === 'GET') {
    await replyJson(route, {
      ...userProjection,
      favorite_count: 4,
      learning_days: 12,
      learning_degraded: false,
      open_scene_completed_count: 7
    })
    return
  }
  if (url.pathname === '/api/v1/admin/users' && request.method() === 'GET') {
    await replyJson(route, [userProjection])
    return
  }
  if (url.pathname === '/api/v1/admin/users/USER-1/commands/contact-status') {
    const status = (record.body as { status?: string } | null)?.status ?? 'PENDING'
    await replyJson(route, { ...contactProjection, contact_status: status })
    return
  }
  if (url.pathname === '/api/v1/admin/users/USER-1/commands/verify-contact-change') {
    await replyJson(route, { ...contactProjection, change_pending: false })
    return
  }
  if (url.pathname === '/api/v1/admin/users/USER-1/contact-copy-events') {
    await route.fulfill({ status: 204 })
    return
  }
  if (url.pathname === '/api/v1/admin/contact-corrections' && request.method() === 'GET') {
    await replyJson(route, {
      items: [createContactCorrection(state.contactCorrectionStatus)],
      page: 1,
      page_size: 20,
      total: 1
    })
    return
  }
  if (url.pathname === '/api/v1/admin/contact-corrections/COR-1' && request.method() === 'GET') {
    await replyJson(route, createContactCorrection(state.contactCorrectionStatus))
    return
  }
  if (
    url.pathname.startsWith('/api/v1/admin/contact-corrections/COR-1/commands/') &&
    request.method() === 'POST'
  ) {
    if (state.contactDecisionConflictPending) {
      state.contactDecisionConflictPending = false
      await replyJson(
        route,
        { code: 'IDEMPOTENCY_KEY_REUSED', message: '数据状态已变化', request_id: 'e2e-409' },
        409
      )
      return
    }
    state.contactCorrectionStatus = url.pathname.endsWith('/approve') ? 'APPROVED' : 'REJECTED'
    await replyJson(route, {
      id: 'COR-1',
      processed_at: '2026-09-29T10:00:00Z',
      status: state.contactCorrectionStatus
    })
    return
  }
  if (url.pathname === '/api/v1/admin/formal-entitlements/preview-operation') {
    await replyJson(route, formalEntitlement)
    return
  }
  if (url.pathname === '/api/v1/admin/formal-entitlements/commands/GRANT') {
    await replyJson(route, formalEntitlement)
    return
  }
  if (url.pathname === '/api/v1/admin/entitlements' && request.method() === 'GET') {
    await replyJson(route, {
      items: [
        {
          id: 'FORMAL-1',
          type: 'FORMAL',
          user_id: 'USER-1',
          status: 'ACTIVE',
          granted_at: '2026-09-29T00:00:00Z',
          expires_at: '2026-12-29T00:00:00Z',
          package_id: 'PACKAGE-1',
          campaign_id: null
        },
        {
          id: 'LIMITED-1',
          type: 'LIMITED',
          user_id: 'USER-1',
          status: 'PENDING',
          granted_at: '2026-09-29T00:00:00Z',
          expires_at: null,
          package_id: null,
          campaign_id: 'CAMP-1'
        }
      ],
      page: Number(url.searchParams.get('page') ?? 1),
      page_size: 20,
      total: 2
    })
    return
  }
  if (url.pathname === '/api/v1/admin/content-packages' && request.method() === 'GET') {
    await replyJson(route, {
      items: [{ id: 'PACKAGE-1', name: '基础内容包', status: 'ACTIVE', sort_order: 1 }],
      page: 1,
      page_size: 20,
      total: 1
    })
    return
  }
  if (url.pathname === '/api/v1/admin/formal-entitlements/FORMAL-1' && request.method() === 'GET') {
    await replyJson(route, {
      ...formalEntitlement,
      package_name: '基础内容包',
      available_operations: ['RENEW', 'PAUSE', 'REVOKE']
    })
    return
  }
  if (
    url.pathname === '/api/v1/admin/limited-entitlements/LIMITED-1' &&
    request.method() === 'GET'
  ) {
    await replyJson(route, {
      id: 'LIMITED-1',
      user_id: 'USER-1',
      campaign_version_id: 'VERSION-1',
      campaign_id: 'CAMP-1',
      campaign_name: state.campaignName,
      status: 'PENDING',
      granted_at: '2026-09-29T00:00:00Z',
      start_deadline: '2026-10-06T00:00:00Z',
      activated_at: null,
      expires_at: null,
      remedy_count: 0,
      version: 1,
      duration_days: 3,
      activation_window_days: 7,
      scene_ids: ['SCENE-1'],
      available_operations: ['EXTEND_START_DEADLINE', 'REVOKE']
    })
    return
  }
  if (
    url.pathname === '/api/v1/admin/limited-entitlements/commands/grant' &&
    request.method() === 'POST'
  ) {
    await replyJson(
      route,
      {
        id: 'LIMITED-2',
        user_id: 'USER-1',
        campaign_version_id: 'VERSION-1',
        status: 'PENDING',
        granted_at: '2026-09-29T00:00:00Z',
        start_deadline: '2026-10-06T00:00:00Z',
        activated_at: null,
        expires_at: null,
        remedy_count: 0,
        version: 1
      },
      201
    )
    return
  }
  if (url.pathname === '/api/v1/admin/campaigns' && request.method() === 'GET') {
    await replyJson(route, {
      items:
        (url.searchParams.has('status') &&
          url.searchParams.get('status') !== state.campaignStatus) ||
        Number(url.searchParams.get('page') ?? 1) !== 1
          ? []
          : [
              {
                id: 'CAMP-1',
                name: state.campaignName,
                status: state.campaignStatus,
                version: state.campaignVersion,
                current_version_id: `VERSION-${state.campaignVersionNo}`,
                capacity: state.campaignCapacity,
                granted_user_count: state.campaignGrantedCount,
                created_at: '2026-09-29T00:00:00Z',
                updated_at: '2026-09-29T00:00:00Z',
                available_operations: campaignOperations(state.campaignStatus)
              }
            ],
      page: Number(url.searchParams.get('page') ?? 1),
      page_size: 20,
      total:
        url.searchParams.has('status') && url.searchParams.get('status') !== state.campaignStatus
          ? 0
          : 1
    })
    return
  }
  if (url.pathname === '/api/v1/admin/campaigns/CAMP-1' && request.method() === 'GET') {
    await replyJson(route, createCampaignDetail(state))
    return
  }
  const creating = url.pathname === '/api/v1/admin/campaigns' && request.method() === 'POST'
  const updating = url.pathname === '/api/v1/admin/campaigns/CAMP-1' && request.method() === 'PUT'
  const operation =
    request.method() === 'POST'
      ? url.pathname === '/api/v1/admin/campaigns/CAMP-1/versions/copy'
        ? 'copy'
        : /^\/api\/v1\/admin\/campaigns\/CAMP-1\/commands\/(open|pause|resume|end|archive|capacity)$/.exec(
            url.pathname
          )?.[1]
      : undefined
  if (creating || updating || operation) {
    const body = record.body
    if (
      !validCampaignBody(body, creating, updating, operation) ||
      !record.headers['x-idempotency-key']
    ) {
      await replyJson(
        route,
        { code: 'VALIDATION_ERROR', message: '活动请求参数不正确', request_id: 'e2e-422' },
        422
      )
      return
    }
    if (!record.headers['x-csrf-token']) {
      await replyJson(
        route,
        { code: 'CSRF_REQUIRED', message: '缺少安全凭证', request_id: 'e2e-403' },
        403
      )
      return
    }
    if (!creating && body.expected_version !== state.campaignVersion) {
      await replyJson(
        route,
        {
          code: 'CAMPAIGN_VERSION_CONFLICT',
          message: '活动版本冲突',
          request_id: 'e2e-campaign-409'
        },
        409
      )
      return
    }
    if (
      (updating && state.campaignStatus !== 'DRAFT') ||
      (operation && !campaignOperations(state.campaignStatus).includes(operation)) ||
      (typeof body.capacity === 'number' && !creating && body.capacity < state.campaignGrantedCount)
    ) {
      await replyJson(
        route,
        {
          code: 'CAMPAIGN_STATE_CONFLICT',
          message: '活动状态或容量不允许此操作',
          request_id: 'e2e-campaign-409'
        },
        409
      )
      return
    }
    if (state.campaignConflictPending) {
      state.campaignConflictPending = false
      state.campaignVersion += 1
      state.campaignName = '其他管理员的新名称'
      await replyJson(
        route,
        {
          code: 'CAMPAIGN_VERSION_CONFLICT',
          message: '活动版本冲突',
          request_id: 'e2e-campaign-409'
        },
        409
      )
      return
    }
    state.campaignVersion = creating ? 1 : state.campaignVersion + 1
    if (creating || operation === 'copy') {
      state.campaignStatus = 'DRAFT'
      state.campaignVersionStatus = 'DRAFT'
      state.campaignVersionNo = creating ? 1 : state.campaignVersionNo + 1
      state.campaignVersionRevision = 1
      state.campaignGrantedCount = 0
    } else {
      if (operation !== 'archive') state.campaignVersionRevision += 1
      const target = campaignTargetStatus[operation ?? '']
      if (target) {
        state.campaignStatus = target
        if (operation !== 'archive') state.campaignVersionStatus = target
      }
    }
    if (creating || updating) {
      state.campaignName = String(body.name)
      if (typeof body.duration_days === 'number') state.campaignDuration = body.duration_days
      if (typeof body.activation_window_days === 'number')
        state.campaignWindow = body.activation_window_days
      if (Array.isArray(body.scene_ids)) state.campaignScenes = body.scene_ids as string[]
    }
    if (typeof body.capacity === 'number') state.campaignCapacity = body.capacity
    await replyJson(route, createCampaignDetail(state), creating ? 201 : 200)
    return
  }
  if (url.pathname === '/api/v1/admin/feedback/FB-1') {
    await replyJson(route, {
      ...feedbackTicket,
      status: state.feedbackStatus,
      supplement_rounds: state.supplementRounds
    })
    return
  }
  if (url.pathname === '/api/v1/admin/feedback/FB-1/commands/request-supplement') {
    state.feedbackStatus = 'NEED_MORE'
    state.supplementRounds = 1
    await replyJson(route, {
      ...feedbackTicket,
      status: state.feedbackStatus,
      supplement_rounds: 1
    })
    return
  }
  if (url.pathname === '/api/v1/admin/media/upload-policies') {
    await replyJson(route, {
      fields: { key: 'e2e/${filename}', policy: 'test-policy' },
      upload_url: 'http://127.0.0.1:4173/__e2e-upload'
    })
    return
  }
  if (url.pathname === '/api/v1/admin/media/uploads/confirm') {
    await route.fulfill({ status: 204 })
    return
  }
  if (url.pathname === '/api/v1/admin/content/revisions/REV-1/publish-checks') {
    await replyJson(route, {
      error_codes: [],
      ready: false,
      warning_codes: ['MISSING_OPTIONAL_AUDIO']
    })
    return
  }
  if (url.pathname === '/api/v1/admin/content/revisions/REV-1/commands/publish') {
    await replyJson(route, { revision_id: 'REV-1', status: 'PUBLISHED' })
    return
  }
  if (url.pathname === '/api/v1/admin/analytics/export') {
    await replyJson(route, [])
    return
  }
  if (url.pathname === '/api/v1/admin/content/open-scenes') {
    await replyJson(route, { items: [], version: 1 })
    return
  }

  state.unexpectedRequests.push(record)
  await replyJson(
    route,
    {
      code: 'UNEXPECTED_TEST_REQUEST',
      message: `未匹配的测试请求 ${record.method} ${record.pathname}`,
      request_id: 'e2e-unknown'
    },
    404
  )
}

const campaignTargetStatus: Record<string, AdminApiState['campaignStatus']> = {
  open: 'OPEN',
  pause: 'PAUSED',
  resume: 'OPEN',
  end: 'ENDED',
  archive: 'ARCHIVED'
}

/**
 * 按后端契约返回夹具允许操作。
 * @param status - 活动状态
 * @returns 允许操作
 */
function campaignOperations(status: string): string[] {
  const operations: Record<string, string[]> = {
    DRAFT: ['open', 'copy', 'capacity'],
    OPEN: ['pause', 'end', 'capacity'],
    PAUSED: ['resume', 'end', 'capacity'],
    ENDED: ['archive', 'copy', 'capacity'],
    CLOSED: ['archive', 'copy', 'capacity'],
    ARCHIVED: ['capacity']
  }
  return operations[status] ?? []
}

/**
 * 校验活动写入请求，禁止缺字段、未知字段及无效数值被夹具吞掉。
 * @param body - HTTP 请求体
 * @param creating - 是否创建
 * @param updating - 是否更新
 * @param operation - 命令名
 * @returns 请求体是否满足契约
 */
function validCampaignBody(
  body: unknown,
  creating: boolean,
  updating: boolean,
  operation?: string
): body is Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const value = body as Record<string, unknown>
  const allowed =
    creating || updating
      ? [
          'name',
          'expected_version',
          'duration_days',
          'activation_window_days',
          'capacity',
          'scene_ids'
        ]
      : ['expected_version', 'capacity']
  if (Object.keys(value).some((key) => !allowed.includes(key))) return false
  if (
    (!creating || value.expected_version !== undefined) &&
    (!Number.isInteger(value.expected_version) || Number(value.expected_version) < 1)
  )
    return false
  if (
    (creating || updating) &&
    (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200)
  )
    return false
  if (
    (creating || value.duration_days !== undefined) &&
    value.duration_days !== 3 &&
    value.duration_days !== 5
  )
    return false
  if (
    (creating || value.activation_window_days !== undefined) &&
    (!Number.isInteger(value.activation_window_days) || Number(value.activation_window_days) < 1)
  )
    return false
  if (
    (creating || operation === 'capacity' || value.capacity !== undefined) &&
    (!Number.isInteger(value.capacity) || Number(value.capacity) < 0)
  )
    return false
  if (
    value.scene_ids !== undefined &&
    (!Array.isArray(value.scene_ids) || value.scene_ids.some((id) => typeof id !== 'string'))
  )
    return false
  return true
}

/**
 * 解析可能为空的 JSON 请求正文
 *
 * @param value - 原始请求正文
 * @returns 解析后的值或空值
 */
function readRequestBody(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

/**
 * 以 JSON 格式响应测试请求
 *
 * @param route - Playwright 路由
 * @param body - JSON 响应体
 * @param status - HTTP 状态码
 * @returns 响应完成后的 Promise
 */
async function replyJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status })
}

/**
 * 创建指定版本的系统配置夹具
 *
 * @param version - 所有配置项的当前版本
 * @returns 系统配置列表响应
 */
function createSettingsResponse(version: number): Record<string, unknown> {
  const feedbackHours = version >= 4 ? 72 : 24
  return {
    items: [
      { key: 'feedback_sla_hours', value: { value: feedbackHours }, version },
      { key: 'entitlement_expiry_warning_days', value: { value: 7 }, version },
      { key: 'shadowing_enabled', value: { value: true }, version },
      { key: 'readonly_preview_enabled', value: { value: false }, version },
      { key: 'unentitled_material_entry_enabled', value: { value: true }, version }
    ]
  }
}

/**
 * 转义用于 URL 断言的正则表达式文本
 *
 * @param value - 原始路径文本
 * @returns 可安全拼接到正则表达式的文本
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const dashboardSnapshot = {
  active_users: 126,
  expiring_entitlements: 8,
  failed_jobs: 0,
  open_feedback: 3,
  overdue_feedback: 1
}

const userProjection = {
  account_status: 'ACTIVE',
  contact: {
    change_pending: true,
    contact_status: 'CONTACTED',
    updated_at: '2026-09-29T09:00:00Z',
    verified_at: '2026-09-29T08:30:00Z',
    verified_by: 'ADMIN-1',
    wechat_id: 'juya_verified'
  },
  contact_degraded: false,
  formal_entitlement_count: 2,
  last_active_at: '2026-09-29T08:00:00Z',
  limited_entitlement_count: 1,
  open_feedback_count: 1,
  user_id: 'USER-1'
}

const contactProjection = {
  change_pending: true,
  contact_status: 'CONTACTED',
  updated_at: '2026-09-29T09:00:00Z',
  user_id: 'USER-1',
  verified_at: '2026-09-29T08:30:00Z',
  verified_by: 'ADMIN-1',
  wechat_id: 'juya_verified'
}

/**
 * 创建联系更正详情夹具
 *
 * @param status - 当前申请状态
 * @returns 联系更正详情响应
 */
function createContactCorrection(status: AdminApiState['contactCorrectionStatus']) {
  return {
    created_at: '2026-09-29T08:00:00Z',
    id: 'COR-1',
    juya_number: 'JY000000000001',
    nickname: '学习者',
    processed_at: status === 'PENDING' ? null : '2026-09-29T10:00:00Z',
    reason: '申请重新修改微信号',
    status,
    timeline: [
      {
        actor_id: 'USER-1',
        actor_type: 'USER',
        event_type: 'CONTACT_CORRECTION_CREATED',
        occurred_at: '2026-09-29T08:00:00Z',
        status: 'PENDING'
      }
    ],
    user_id: 'USER-1',
    wechat_id: 'juya_verified'
  }
}

const formalEntitlement = {
  expires_at: '2026-12-29T00:00:00Z',
  granted_at: '2026-09-29T00:00:00Z',
  id: 'FORMAL-1',
  package_id: 'PACKAGE-1',
  status: 'ACTIVE',
  term: 'MONTH_3',
  user_id: 'USER-1',
  version: 1
}

/**
 * 返回与 FastAPI CampaignResponse 契约一致的活动详情夹具。
 * @param state - 当前模拟服务端状态
 * @returns 活动详情响应
 */
function createCampaignDetail(state: AdminApiState) {
  return {
    available_operations: campaignOperations(state.campaignStatus),
    created_at: '2026-09-29T00:00:00Z',
    current_version: {
      activation_window_days: state.campaignWindow,
      capacity: state.campaignCapacity,
      duration_days: state.campaignDuration,
      grant_ends_at: null,
      grant_starts_at: null,
      granted_user_count: state.campaignGrantedCount,
      id: `VERSION-${state.campaignVersionNo}`,
      locked_at: state.campaignStatus === 'DRAFT' ? null : '2026-09-29T00:00:00Z',
      scene_ids: state.campaignScenes,
      status: state.campaignVersionStatus,
      version: state.campaignVersionRevision,
      version_no: state.campaignVersionNo
    },
    id: 'CAMP-1',
    name: state.campaignName,
    status: state.campaignStatus,
    updated_at: '2026-09-29T00:00:00Z',
    version: state.campaignVersion
  }
}

const feedbackTicket = {
  category: 'CONTENT_ERROR',
  closed_at: null,
  created_at: '2026-09-29T01:00:00Z',
  deadline_at: '2026-09-30T01:00:00Z',
  description: '第三句字幕与音频不一致',
  id: 'FB-1',
  reopen_count: 0,
  resolved_at: null,
  sla_remaining_seconds: 36_000,
  source: { app_version: '1.0.0' },
  status: 'PROCESSING',
  supplement_rounds: 0,
  updated_at: '2026-09-29T02:00:00Z',
  user_id: 'USER-1'
}

const auditEvent = {
  action: 'settings.update',
  actor_public_id: 'ADMIN-1',
  after_summary: { value: 24 },
  before_summary: { value: 48 },
  object_public_id: 'feedback_sla_hours',
  object_type: 'setting',
  occurred_at: '2026-09-29T02:00:00Z',
  reason: '调整处理时限',
  request_id: 'request-e2e'
}
