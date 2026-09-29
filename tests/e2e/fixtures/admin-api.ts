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
  conflictOnNextContactDecision(): void
  conflictOnNextSettingsUpdate(): void
  findRequest(method: string, pathname: string): ApiRequestRecord | undefined
  requests: ApiRequestRecord[]
  unauthorizedPaths: Set<string>
}

interface AdminApiState extends AdminApiMock {
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
      contactDecisionConflictPending: false,
      feedbackStatus: 'PROCESSING',
      requests: [],
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

  await replyJson(route, {})
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
