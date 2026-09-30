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
  conflictOnNextDiscoverySave(): void
  conflictOnNextRevisionSave(): void
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
  discoveryConflictPending: boolean
  discoveryVersion: number
  feedbackNotes: Array<Record<string, unknown>>
  feedbackScreenshotSequence: number
  feedbackStatus: string
  revisionConflictPending: boolean
  revisionContent: Record<string, unknown>
  revisionVersion: number
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
      conflictOnNextDiscoverySave() {
        state.discoveryConflictPending = true
      },
      conflictOnNextRevisionSave() {
        state.revisionConflictPending = true
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
      discoveryConflictPending: false,
      discoveryVersion: 3,
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
      feedbackNotes: [],
      feedbackScreenshotSequence: 0,
      feedbackStatus: 'PROCESSING',
      revisionConflictPending: false,
      revisionContent: {
        dialogue: [{ speaker: 'Clerk', text: 'What would you like?' }],
        summary: '咖啡店点单练习',
        tags: ['日常'],
        title: 'Ordering coffee',
        vocabulary: [{ term: 'latte', translation: '拿铁' }]
      },
      revisionVersion: 3,
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
  if (url.pathname === '/api/v1/admin/feedback' && request.method() === 'GET') {
    await replyJson(route, {
      items: [
        {
          category: feedbackTicket.category,
          created_at: feedbackTicket.created_at,
          deadline_at: feedbackTicket.deadline_at,
          description: feedbackTicket.description,
          id: feedbackTicket.id,
          sla_state: 'ON_TRACK',
          status: state.feedbackStatus,
          supplement_rounds: state.supplementRounds,
          updated_at: feedbackTicket.updated_at,
          user_id: feedbackTicket.user_id
        }
      ],
      page: Number(url.searchParams.get('page') ?? 1),
      page_size: 20,
      total: 21
    })
    return
  }
  if (
    url.pathname === '/api/v1/admin/feedback/FB-1/screenshot-url' &&
    request.method() === 'POST'
  ) {
    state.feedbackScreenshotSequence += 1
    await replyJson(route, {
      expires_at: '2026-09-29T12:05:00Z',
      url: `https://signed.example/feedback-1?version=${state.feedbackScreenshotSequence}`
    })
    return
  }
  if (
    url.pathname === '/api/v1/admin/feedback/FB-1/internal-notes' &&
    request.method() === 'POST'
  ) {
    const body = record.body as { content?: unknown }
    const note = {
      admin_id: 'ADMIN-1',
      content: String(body.content ?? ''),
      created_at: '2026-09-29T10:00:00Z',
      id: `NOTE-${state.feedbackNotes.length + 1}`
    }
    state.feedbackNotes.push(note)
    await replyJson(route, note, 201)
    return
  }
  if (url.pathname === '/api/v1/admin/feedback/FB-1' && request.method() === 'GET') {
    await replyJson(route, {
      ...feedbackTicket,
      internal_notes: state.feedbackNotes,
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
    const body = record.body as { asset_type?: unknown }
    const isAudio = body.asset_type === 'audio'
    await replyJson(
      route,
      {
        asset_type: isAudio ? 'audio' : 'images',
        content_type: isAudio ? 'audio/mpeg' : 'image/png',
        id: isAudio ? 'ASSET-AUDIO-2' : 'ASSET-UPLOADED-1',
        sha256: 'a'.repeat(64),
        size: 1024,
        status: 'CONFIRMED'
      },
      201
    )
    return
  }
  if (url.pathname === '/api/v1/admin/media/ocr/jobs' && request.method() === 'POST') {
    await replyJson(route, { ...createMediaJob(), id: 'JOB-UPLOAD', status: 'PENDING' }, 201)
    return
  }
  if (url.pathname === '/api/v1/admin/media/ocr/jobs/JOB-1' && request.method() === 'GET') {
    await replyJson(route, createMediaJob())
    return
  }
  if (
    url.pathname === '/api/v1/admin/media/ocr/jobs/JOB-1/candidate' &&
    request.method() === 'GET'
  ) {
    await replyJson(route, {
      asset_id: 'ASSET-1',
      confidence: 0.98,
      confirmed_revision_id: null,
      error_code: null,
      id: 'CANDIDATE-1',
      job_id: 'JOB-1',
      status: 'READY',
      structured_candidate: { title: 'Coffee time' },
      template_type: 'learning-card'
    })
    return
  }
  if (/^\/api\/v1\/admin\/media\/ocr\/jobs\/JOB-1\/commands\/(cancel|retry)$/.test(url.pathname)) {
    await replyJson(route, {
      ...createMediaJob(),
      status: url.pathname.endsWith('/cancel') ? 'CANCELLED' : 'PENDING'
    })
    return
  }
  if (url.pathname === '/api/v1/admin/media/ocr/jobs/JOB-1/commands/confirm') {
    await replyJson(route, { revision_id: 'REV-OCR-2', revision_status: 'DRAFT', version: 2 })
    return
  }
  if (url.pathname === '/api/v1/admin/media/audio-targets' && request.method() === 'GET') {
    await replyJson(route, { items: [createAudioTarget()] })
    return
  }
  if (
    url.pathname === '/api/v1/admin/media/audio-targets/TARGET-1/versions' &&
    request.method() === 'GET'
  ) {
    await replyJson(route, { items: [createAudioVersion()] })
    return
  }
  if (
    url.pathname === '/api/v1/admin/media/audio-targets/TARGET-1/versions' &&
    request.method() === 'POST'
  ) {
    await replyJson(route, { ...createAudioVersion(), id: 'VERSION-2', status: 'CANDIDATE' }, 201)
    return
  }
  if (url.pathname === '/api/v1/admin/media/audio-targets/TARGET-1/commands/generate') {
    await replyJson(route, { ...createMediaJob(), id: 'TTS-JOB-1', job_type: 'TTS' }, 201)
    return
  }
  if (/^\/api\/v1\/admin\/media\/audio-versions\/[^/]+\/commands\/confirm$/.test(url.pathname)) {
    await replyJson(route, { ...createAudioTarget(), active_version_id: 'VERSION-2' })
    return
  }
  if (url.pathname === '/api/v1/admin/media/audio-targets/TARGET-1/commands/rollback') {
    await replyJson(route, createAudioTarget())
    return
  }
  if (url.pathname === '/api/v1/admin/media/batch-jobs' && request.method() === 'GET') {
    await replyJson(route, { items: [createBatchJob()], page: 1, page_size: 20, total: 1 })
    return
  }
  if (url.pathname === '/api/v1/admin/media/batch-jobs' && request.method() === 'POST') {
    await replyJson(route, createBatchJob(), 201)
    return
  }
  if (
    /^\/api\/v1\/admin\/media\/batch-jobs\/BATCH-1\/commands\/(cancel|retry-failed)$/.test(
      url.pathname
    )
  ) {
    await replyJson(route, createBatchJob())
    return
  }
  if (url.pathname === '/api/v1/admin/media/trash' && request.method() === 'GET') {
    await replyJson(route, { items: [createTrashEntry()] })
    return
  }
  if (url.pathname === '/api/v1/admin/media/trash' && request.method() === 'POST') {
    await replyJson(route, createTrashEntry(), 201)
    return
  }
  if (/^\/api\/v1\/admin\/media\/trash\/TRASH-1\/commands\/(restore|cleanup)$/.test(url.pathname)) {
    await replyJson(route, {
      ...createTrashEntry(),
      status: url.pathname.endsWith('/restore') ? 'RESTORED' : 'CLEANED'
    })
    return
  }
  if (url.pathname === '/api/v1/admin/content/scenes' && request.method() === 'GET') {
    await replyJson(route, {
      items: [createContentScene()],
      page: Number(url.searchParams.get('page') ?? 1),
      page_size: Number(url.searchParams.get('page_size') ?? 20),
      total: 1
    })
    return
  }
  if (url.pathname === '/api/v1/admin/content/scenes/SCENE-1' && request.method() === 'GET') {
    await replyJson(route, createContentScene())
    return
  }
  if (
    url.pathname === '/api/v1/admin/content/revisions/REV-DRAFT-1' &&
    request.method() === 'GET'
  ) {
    await replyJson(route, createContentRevision(state))
    return
  }
  if (
    url.pathname === '/api/v1/admin/content/revisions/REV-DRAFT-1' &&
    request.method() === 'PUT'
  ) {
    if (state.revisionConflictPending) {
      state.revisionConflictPending = false
      state.revisionVersion = 4
      state.revisionContent = { ...state.revisionContent, title: '其他管理员的标题' }
      await replyJson(
        route,
        {
          code: 'REVISION_VERSION_CONFLICT',
          details: { current_version: state.revisionVersion },
          message: '草稿版本冲突',
          request_id: 'e2e-revision-409'
        },
        409
      )
      return
    }
    const body = record.body as { content?: Record<string, unknown>; expected_version?: number }
    state.revisionContent = body.content ?? state.revisionContent
    state.revisionVersion += 1
    await replyJson(route, createContentRevision(state))
    return
  }
  if (/^\/api\/v1\/admin\/content\/revisions\/(REV-DRAFT-1|REV-1)\/preview$/.test(url.pathname)) {
    await replyJson(route, {
      content: state.revisionContent,
      revision_id: url.pathname.includes('REV-DRAFT-1') ? 'REV-DRAFT-1' : 'REV-1',
      revision_status: 'DRAFT',
      scene_id: 'SCENE-1',
      scene_title: 'Ordering coffee',
      series_title: '日常英语'
    })
    return
  }
  if (url.pathname === '/api/v1/admin/content/discovery-config' && request.method() === 'GET') {
    await replyJson(route, createDiscoveryConfig(state.discoveryVersion))
    return
  }
  if (url.pathname === '/api/v1/admin/content/discovery-config' && request.method() === 'PUT') {
    if (state.discoveryConflictPending) {
      state.discoveryConflictPending = false
      state.discoveryVersion = 4
      await replyJson(
        route,
        {
          code: 'DISCOVERY_CONFIG_VERSION_CONFLICT',
          details: { current_version: state.discoveryVersion },
          message: '发现页配置版本冲突',
          request_id: 'e2e-discovery-409'
        },
        409
      )
      return
    }
    state.discoveryVersion += 1
    await replyJson(route, {
      ...(record.body as Record<string, unknown>),
      actor_id: 'ADMIN-1',
      updated_at: '2026-09-30T10:30:00Z',
      version: state.discoveryVersion
    })
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

/**
 * 创建与内容目录契约一致的场景摘要
 * @returns 场景摘要响应
 */
function createContentScene(): Record<string, unknown> {
  return {
    cover_object_key: null,
    draft_revision_id: 'REV-DRAFT-1',
    id: 'SCENE-1',
    published_revision_id: 'REV-1',
    series_id: 'SERIES-1',
    series_title: '日常英语',
    status: 'PUBLISHED',
    summary: '咖啡店点单练习',
    title: 'Ordering coffee',
    updated_at: '2026-09-30T10:00:00Z'
  }
}

/**
 * 创建媒体任务响应夹具
 * @returns OCR 任务响应
 */
function createMediaJob(): Record<string, unknown> {
  return {
    batch_id: null,
    business_key: 'ocr:e2e',
    cancel_requested_at: null,
    created_at: '2026-09-30T10:00:00Z',
    created_by: 'ADMIN-1',
    error_code: null,
    id: 'JOB-1',
    job_type: 'OCR',
    provider_request_id: 'provider-1',
    status: 'SUCCEEDED',
    target_id: 'ASSET-1',
    updated_at: '2026-09-30T10:01:00Z'
  }
}

/**
 * 创建音频目标夹具
 * @returns 音频目标响应
 */
function createAudioTarget(): Record<string, unknown> {
  return {
    active_version_id: 'VERSION-1',
    id: 'TARGET-1',
    stable_key: 'SENTENCE-1',
    target_type: 'SENTENCE'
  }
}

/**
 * 创建音频版本夹具
 * @returns 音频版本响应
 */
function createAudioVersion(): Record<string, unknown> {
  return {
    asset_id: 'ASSET-AUDIO-1',
    created_at: '2026-09-30T10:00:00Z',
    created_by: 'ADMIN-1',
    id: 'VERSION-1',
    processing_job_id: null,
    provider_request_id: null,
    source: 'MANUAL',
    status: 'ACTIVE',
    target_id: 'TARGET-1',
    version_no: 1
  }
}

/**
 * 创建含单项成功和失败结果的批量任务夹具
 * @returns 批量任务响应
 */
function createBatchJob(): Record<string, unknown> {
  return {
    business_key: 'batch:e2e',
    cancel_requested_at: null,
    completed_at: '2026-09-30T10:01:00Z',
    created_at: '2026-09-30T10:00:00Z',
    created_by: 'ADMIN-1',
    failure_count: 1,
    id: 'BATCH-1',
    items: [
      {
        attempt_count: 1,
        error_code: null,
        id: 'ITEM-1',
        item_key: '0:SCENE-1',
        processing_job_id: null,
        result_version: 1,
        status: 'SUCCEEDED',
        target_id: 'SCENE-1'
      },
      {
        attempt_count: 1,
        error_code: 'VALIDATION_FAILED',
        id: 'ITEM-2',
        item_key: '1:SCENE-2',
        processing_job_id: null,
        result_version: null,
        status: 'FAILED',
        target_id: 'SCENE-2'
      }
    ],
    job_type: 'VALIDATE',
    status: 'COMPLETED_WITH_ERRORS',
    success_count: 1,
    total_count: 2,
    updated_at: '2026-09-30T10:01:00Z'
  }
}

/**
 * 创建草稿回收站夹具
 * @returns 回收站响应
 */
function createTrashEntry(): Record<string, unknown> {
  return {
    cleaned_at: null,
    id: 'TRASH-1',
    restored_at: null,
    retention_until: '2026-10-30T10:00:00Z',
    revision_id: 'REV-DRAFT-1',
    scene_id: 'SCENE-1',
    status: 'TRASHED',
    trashed_at: '2026-09-30T10:00:00Z',
    trashed_by: 'ADMIN-1'
  }
}

/**
 * 创建当前版本的草稿响应
 * @param state - 管理端夹具状态
 * @returns 草稿响应
 */
function createContentRevision(state: AdminApiState): Record<string, unknown> {
  return {
    content: state.revisionContent,
    created_at: '2026-09-30T10:00:00Z',
    created_by: 'ADMIN-1',
    id: 'REV-DRAFT-1',
    scene_id: 'SCENE-1',
    source_revision_id: 'REV-1',
    stable_entry_ids: ['ENTRY-1'],
    stable_sentence_ids: ['SENTENCE-1'],
    status: 'DRAFT',
    version: state.revisionVersion
  }
}

/**
 * 创建统一发现页配置响应
 * @param version - 当前配置版本
 * @returns 发现页配置响应
 */
function createDiscoveryConfig(version: number): Record<string, unknown> {
  return {
    actor_id: 'ADMIN-1',
    learning_modules: { scene_learning: true, shadowing: false },
    open_scene_ids: ['SCENE-1', 'SCENE-2', 'SCENE-3'],
    preview_by_series: { 'SERIES-1': ['SCENE-4', 'SCENE-5', 'SCENE-6'] },
    updated_at: '2026-09-30T10:00:00Z',
    version
  }
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
  category: 'CONTENT',
  closed_at: null,
  created_at: '2026-09-29T01:00:00Z',
  deadline_at: '2026-09-30T01:00:00Z',
  description: '<img src=x onerror=alert(1)>',
  id: 'FB-1',
  internal_notes: [],
  reopen_count: 0,
  replies: [],
  resolved_at: null,
  rounds: [
    {
      paused_at: '2026-09-29T03:00:00Z',
      request_text: '请补充出现问题的页面',
      round_number: 1,
      supplied_at: '2026-09-29T04:00:00Z',
      supplement_text: '已补充学习页截图'
    }
  ],
  screenshots: [{ delete_after: null, deleted_at: null, security_status: 'PASSED' }],
  sla_remaining_seconds: 36_000,
  source: { app_version: '1.0.0' },
  status: 'PROCESSING',
  supplement_rounds: 0,
  timeline: [
    {
      actor_id: 'USER-1',
      actor_type: 'USER',
      event_type: 'CREATED',
      occurred_at: '2026-09-29T01:00:00Z',
      payload: {},
      visibility: 'BOTH'
    },
    {
      actor_id: 'ADMIN-1',
      actor_type: 'ADMIN',
      event_type: 'PROCESSING_STARTED',
      occurred_at: '2026-09-29T02:00:00Z',
      payload: {},
      visibility: 'BOTH'
    }
  ],
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
