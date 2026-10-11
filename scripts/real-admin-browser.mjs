import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'

import { chromium, expect } from '@playwright/test'

const baseUrl = process.env.JUYA_QA_BASE_URL || 'http://127.0.0.1:18183'
const username = process.env.JUYA_HTTP_TEST_USERNAME
const password = process.env.JUYA_HTTP_TEST_PASSWORD
const entities = JSON.parse(process.env.JUYA_QA_ENTITIES || '{}')
const output = process.env.JUYA_QA_OUTPUT_DIR
if (!username || !password || !output)
  throw new Error('请通过进程环境提供管理员凭据和 JUYA_QA_OUTPUT_DIR')
if (!entities.series_id || !entities.scene_id)
  throw new Error('JUYA_QA_ENTITIES 必须提供隔离环境的 series_id 与 scene_id')
const requested = new Set(
  (process.env.JUYA_QA_CASES || 'login,scene,short,short-sort,modules,import,settings,pages').split(
    ','
  )
)
// 协调侧提供对应真实种子时，默认完整运行新增闭环，无需设置子集覆盖
if (entities.preview_batch_id && entities.preview_resource_path) requested.add('import-preview')
if (entities.retry_stage_id) requested.add('stage-retry')
if (
  entities.publication_range_token &&
  entities.publication_revision_id &&
  entities.publication_content_id
)
  requested.add('range-publish')
if (entities.slice_scene_id && entities.slice_revision_id && entities.slice_sentence_id)
  requested.add('slice-restore')
const results = {
  status: 'RUNNING',
  baseUrl,
  cases: [],
  responses: [],
  stageRecovery: [],
  errors: [],
  networkFailures: []
}
let activeCase = 'login'
const responseReads = []
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await mkdir(output, { recursive: true })
page.on('response', (response) => {
  const url = new URL(response.url())
  if (!url.pathname.startsWith('/api/v1/admin/')) return
  const record = {
    method: response.request().method(),
    path: url.pathname,
    status: response.status(),
    request_id: response.headers()['x-request-id'] || null
  }
  results.responses.push(record)
  if (record.status >= 400) {
    responseReads.push(
      response
        .json()
        .then((body) => {
          record.error_code =
            typeof body?.code === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(body.code)
              ? body.code
              : 'UNCLASSIFIED'
        })
        .catch(() => {
          record.error_code = 'UNCLASSIFIED'
        })
    )
  }
})
page.on('pageerror', (error) => results.errors.push({ type: error.name || 'RuntimeError' }))
page.on('requestfailed', (request) => {
  const url = new URL(request.url())
  if (!url.pathname.startsWith('/api/v1/admin/')) return
  results.networkFailures.push({
    method: request.method(),
    path: url.pathname,
    type: request.failure()?.errorText === 'net::ERR_ABORTED' ? 'ABORTED' : 'NETWORK_FAILURE'
  })
})

const /**
   * 记录恢复阶段的安全身份与状态，不保存完整响应或正文
   * @param source - 读取、排队回执或后续状态回读
   * @param row - 实际阶段响应
   * @returns 允许进入联调报告的受限事实
   */ stageFact = (source, row) => ({
    source,
    stage_id: /^[0-9A-HJKMNP-TV-Z]{26}$/.test(row.stage_id || row.public_id || '')
      ? row.stage_id || row.public_id
      : null,
    status: ['FAILED', 'QUEUED', 'RUNNING', 'RETRY', 'SUCCEEDED', 'CANCELLED', 'UNKNOWN'].includes(
      row.status
    )
      ? row.status
      : 'UNCLASSIFIED',
    attempt: Number.isSafeInteger(row.attempt) && row.attempt >= 0 ? row.attempt : null,
    fencing_version:
      Number.isSafeInteger(row.fencing_version) && row.fencing_version >= 0
        ? row.fencing_version
        : null,
    error_code:
      typeof row.error_code === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(row.error_code)
        ? row.error_code
        : null
  })

const /**
   * 等待页面实际发出的业务请求，不拦截或模拟响应
   * @param method - 被验收的 HTTP 方法
   * @param pathname - 当前实体的固定请求路径
   * @returns 与动作绑定的实际响应
   */ responseFor = (method, pathname) =>
    page.waitForResponse(
      (response) =>
        response.request().method() === method && new URL(response.url()).pathname === pathname
    )

const /**
   * 记录当前明确验收动作；缺少种子时保留未执行状态
   * @param name - 协调侧选择的验收场景
   * @param action - 页面动作与实际结果断言
   * @param available - 本次隔离种子是否支持该场景
   * @returns 动作完成状态
   */ run = async (name, action, available = true) => {
    if (!requested.has(name)) return
    activeCase = name
    if (!available) {
      results.cases.push({ name, status: 'NOT_RUN', reason: '缺少该场景的隔离种子' })
      return
    }
    await action()
    await page.waitForLoadState('networkidle')
    results.cases.push({ name, status: 'PASSED' })
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true })
  }

const /**
   * 保存后刷新验证当前标题来自真实服务回读
   * @param route - 当前草稿页面
   * @param pathname - 固定修订保存接口
   * @param title - 本次隔离草稿的新英文标题
   * @returns 保存与刷新完成状态
   */ saveTitle = async (route, pathname, title) => {
    await page.goto(new URL(route, baseUrl).href)
    const field = page.getByLabel('英文标题', { exact: true })
    await field.fill(title)
    const saved = responseFor('PUT', pathname)
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await page.reload()
    await expect(field).toHaveValue(title)
  }

try {
  // 登录始终是所有场景的前置条件，凭据仅保留在进程和浏览器内存
  await page.goto(new URL('/login', baseUrl).href)
  await page.locator('input[autocomplete="username"]').fill(username)
  await page.locator('input[autocomplete="current-password"]').fill(password)
  const login = responseFor('POST', '/api/v1/admin/session')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  expect((await login).status()).toBe(200)
  await page.waitForURL('**/dashboard')
  await run('login', async () => {
    const restored = responseFor('GET', '/api/v1/admin/session')
    await page.reload()
    expect((await restored).status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
  await run(
    'scene',
    () =>
      saveTitle(
        `/content/scenes/${encodeURIComponent(entities.scene_id)}/edit`,
        `/api/v1/admin/content/revisions/${entities.revision_id}`,
        `QA scene ${Date.now()}`
      ),
    !!entities.revision_id
  )
  await run(
    'short',
    () =>
      saveTitle(
        `/content/short-readings/${encodeURIComponent(entities.short_reading_id)}/edit`,
        `/api/v1/admin/content/short-readings/${entities.short_reading_id}/revisions/${entities.short_revision_id}`,
        `QA reading ${Date.now()}`
      ),
    !!entities.short_reading_id && !!entities.short_revision_id
  )
  await run(
    'import',
    async () => {
      await page.goto(
        new URL(`/content/import?batch_id=${encodeURIComponent(entities.batch_id)}`, baseUrl).href
      )
      await expect(page.getByRole('heading', { name: '草稿保存结果', exact: true })).toBeVisible()
      await expect(
        page.locator('.el-table__row').filter({ hasText: '草稿已保存' }).first()
      ).toBeVisible()
    },
    !!entities.batch_id
  )
  await run(
    'short-sort',
    async () => {
      const route = `/content/short-readings/${encodeURIComponent(entities.short_reading_id)}/edit`
      await page.goto(new URL(route, baseUrl).href)
      const order = page.getByRole('spinbutton', { name: '全局短文顺序', exact: true })
      await order.fill('73')
      const saved = responseFor(
        'POST',
        `/api/v1/admin/content/short-readings/${entities.short_reading_id}/sort-order`
      )
      await page.getByRole('button', { name: '保存全局顺序', exact: true }).click()
      expect((await saved).status()).toBe(200)
      await expect(page.getByText('短文全局顺序已保存', { exact: true })).toBeVisible()
      await page.reload()
      await expect(order).toHaveValue('73')
    },
    !!entities.short_reading_id
  )
  await run('modules', async () => {
    await page.goto(new URL('/content/discovery-config', baseUrl).href)
    const name = page.getByRole('textbox', { name: '场景学习显示名称', exact: true })
    const order = page.getByRole('spinbutton', { name: '场景学习顺序', exact: true })
    await expect(name).toBeVisible()
    const before = { name: await name.inputValue(), order: await order.inputValue() }
    await name.fill('联调场景学习')
    await order.fill('17')
    const saved = responseFor('PUT', '/api/v1/admin/content/learning-modules/scene_learning')
    await page.getByRole('button', { name: '保存场景学习', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await expect(page.getByRole('button', { name: '保存场景学习', exact: true })).toBeEnabled()
    await page.reload()
    await expect(name).toHaveValue('联调场景学习')
    await expect(order).toHaveValue('17')
    await name.fill(before.name)
    await order.fill(before.order)
    const restored = responseFor('PUT', '/api/v1/admin/content/learning-modules/scene_learning')
    await page.getByRole('button', { name: '保存场景学习', exact: true }).click()
    expect((await restored).status()).toBe(200)
    await expect(page.getByRole('button', { name: '保存场景学习', exact: true })).toBeEnabled()
  })
  await run(
    'import-preview',
    async () => {
      await page.goto(
        new URL(
          `/content/import?batch_id=${encodeURIComponent(entities.preview_batch_id)}`,
          baseUrl
        ).href
      )
      await page.getByRole('button', { name: '查看对应关系与差异', exact: true }).click()
      const binding = page
        .locator('.binding')
        .filter({ hasText: entities.preview_resource_path })
        .first()
      const previewed = responseFor(
        'POST',
        `/api/v1/admin/content-imports/${entities.preview_batch_id}/resources/preview`
      )
      await binding.getByRole('button', { name: '预览此素材', exact: true }).click()
      expect((await previewed).status()).toBe(200)
      const image = binding.getByAltText('导入素材受控预览')
      await expect(image).toBeVisible()
      await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0)
    },
    !!entities.preview_batch_id && !!entities.preview_resource_path
  )
  await run(
    'stage-retry',
    async () => {
      await page.goto(new URL('/content/import', baseUrl).href)
      await page
        .getByRole('textbox', { name: '失败阶段编号', exact: true })
        .fill(entities.retry_stage_id)
      const loaded = responseFor('GET', `/api/v1/admin/content-stages/${entities.retry_stage_id}`)
      await page.getByRole('button', { name: '读取阶段状态', exact: true }).click()
      const before = await (await loaded).json()
      results.stageRecovery.push(stageFact('BEFORE_RETRY', before))
      expect(before.status).toBe('FAILED')
      expect(
        ['VALIDATE', 'CONFIRM', 'MATERIAL_VALIDATE'].includes(before.stage) ||
          before.stage.startsWith('MATERIAL_BIND_')
      ).toBe(true)
      await page
        .locator('.content-stage-recovery-panel .el-checkbox')
        .filter({ hasText: '明确重试这个失败阶段' })
        .click()
      await expect(
        page.getByRole('checkbox', { name: '明确重试这个失败阶段', exact: true })
      ).toBeChecked()
      const retried = responseFor(
        'POST',
        `/api/v1/admin/content-stages/${entities.retry_stage_id}/retry`
      )
      await page.getByRole('button', { name: '恢复明确失败阶段', exact: true }).click()
      const retryResponse = await retried
      expect(retryResponse.status()).toBe(202)
      const receipt = await retryResponse.json()
      results.stageRecovery.push(stageFact('RETRY_RECEIPT', receipt))
      await expect(page.getByRole('button', { name: '读取阶段状态', exact: true })).toBeEnabled()
      await expect
        .poll(
          async () => {
            const read = responseFor('GET', '/api/v1/admin/content-stages/' + receipt.stage_id)
            await page.getByRole('button', { name: '读取阶段状态', exact: true }).click()
            const current = await (await read).json()
            results.stageRecovery.push(stageFact('READBACK', current))
            return current.status
          },
          { timeout: 45_000, intervals: [1000, 2000] }
        )
        .toBe('SUCCEEDED')
    },
    !!entities.retry_stage_id
  )
  await run(
    'slice-restore',
    async () => {
      const endpoint = `/api/v1/admin/content/revisions/${entities.slice_revision_id}/sentences/${entities.slice_sentence_id}/slice-state`
      const loaded = responseFor('GET', endpoint)
      await page.goto(
        new URL(
          `/content/scenes/${encodeURIComponent(entities.slice_scene_id)}/edit?stage=audio`,
          baseUrl
        ).href
      )
      const state = await (await loaded).json()
      expect(['READY_TO_LISTEN', 'CONFIRMED']).toContain(state.status)
      expect(state.resource_version).toBeTruthy()
      await expect(
        page
          .locator('.sentence-slices-panel')
          .getByRole('button', { name: '试听独立文件', exact: true })
          .first()
      ).toBeEnabled()
      const restored = responseFor('GET', endpoint)
      await page.reload()
      const after = await (await restored).json()
      expect(after.resource_version).toBe(state.resource_version)
      expect(after.dependency_hash).toBe(state.dependency_hash)
    },
    !!entities.slice_scene_id && !!entities.slice_revision_id && !!entities.slice_sentence_id
  )
  await run(
    'range-publish',
    async () => {
      const token = entities.publication_range_token
      await page.goto(
        new URL(`/content/proofreading?range_token=${encodeURIComponent(token)}`, baseUrl).href
      )
      const loaded = responseFor('GET', `/api/v1/admin/content/publication-ranges/${token}`)
      await page.getByRole('button', { name: '恢复发布范围', exact: true }).click()
      expect((await loaded).status()).toBe(200)
      const row = page.locator('.range-item').filter({ hasText: entities.publication_content_id })
      await row.locator('.el-checkbox').click()
      await page
        .locator('.publication-range-panel .el-checkbox')
        .filter({ hasText: '已核对本次选中的固定候选' })
        .click()
      const confirmed = responseFor(
        'POST',
        `/api/v1/admin/content/publication-ranges/${token}/confirm`
      )
      await page.getByRole('button', { name: '发布明确选中 1 篇', exact: true }).click()
      expect((await confirmed).status()).toBe(202)
      await expect
        .poll(
          async () => {
            const response = responseFor('GET', `/api/v1/admin/content/publication-ranges/${token}`)
            await page.getByRole('button', { name: '刷新逐项发布结果', exact: true }).click()
            const current = await (await response).json()
            return current.results.items[entities.publication_revision_id]?.status || 'PENDING'
          },
          { timeout: 45_000, intervals: [1000, 2000] }
        )
        .toBe('SUCCEEDED')
      await expect(row).toContainText('已发布')
    },
    !!entities.publication_range_token &&
      !!entities.publication_revision_id &&
      !!entities.publication_content_id
  )
  await run('settings', async () => {
    await page.goto(new URL('/settings', baseUrl).href)
    const recording = page.getByRole('switch', { name: '跟读录音权限', exact: true })
    await expect(recording).toBeEnabled()
    const initial = await recording.getAttribute('aria-checked')
    const profile = page.getByRole('switch', { name: '完善资料次级入口', exact: true })
    await expect(profile).toBeEnabled()
    const initialProfile = await profile.getAttribute('aria-checked')
    await recording.click()
    const saved = responseFor('PUT', '/api/v1/admin/learning-features')
    await page.getByRole('button', { name: '保存学习与资料入口', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await expect(
      page.getByRole('button', { name: '保存学习与资料入口', exact: true })
    ).toBeEnabled()
    await page.reload()
    await expect(recording).toHaveAttribute('aria-checked', initial === 'true' ? 'false' : 'true')
    await expect(profile).toHaveAttribute('aria-checked', initialProfile)
    await recording.click()
    const reverted = responseFor('PUT', '/api/v1/admin/learning-features')
    await page.getByRole('button', { name: '保存学习与资料入口', exact: true }).click()
    expect((await reverted).status()).toBe(200)
    await expect(
      page.getByRole('button', { name: '保存学习与资料入口', exact: true })
    ).toBeEnabled()
    await profile.click()
    const profileSaved = responseFor('PUT', '/api/v1/admin/learning-features')
    await page.getByRole('button', { name: '保存学习与资料入口', exact: true }).click()
    expect((await profileSaved).status()).toBe(200)
    await expect(
      page.getByRole('button', { name: '保存学习与资料入口', exact: true })
    ).toBeEnabled()
    await page.reload()
    await expect(profile).toHaveAttribute(
      'aria-checked',
      initialProfile === 'true' ? 'false' : 'true'
    )
    await expect(recording).toHaveAttribute('aria-checked', initial)
    await profile.click()
    const profileReverted = responseFor('PUT', '/api/v1/admin/learning-features')
    await page.getByRole('button', { name: '保存学习与资料入口', exact: true }).click()
    expect((await profileReverted).status()).toBe(200)
    await expect(
      page.getByRole('button', { name: '保存学习与资料入口', exact: true })
    ).toBeEnabled()
  })
  await run('pages', async () => {
    for (const route of ['/content/discovery-config', '/campaigns', '/feedback', '/settings']) {
      const loaded = responseFor(
        'GET',
        `/api/v1/admin/${route === '/settings' ? 'settings' : route.slice(1)}`
      )
      await page.goto(new URL(route, baseUrl).href)
      expect((await loaded).status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForLoadState('networkidle')
    }
  })
  activeCase = 'layouts'
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport)
    for (const route of ['/content/discovery-config', '/content/proofreading']) {
      await page.goto(new URL(route, baseUrl).href)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForLoadState('networkidle')
      expect(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth - globalThis.innerWidth
        )
      ).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: path.join(output, `layout-${route.split('/').at(-1)}-${viewport.width}.png`),
        fullPage: true
      })
    }
  }
  await Promise.allSettled(responseReads)
  const unexpected = results.responses.filter(
    (response) =>
      response.status >= 400 &&
      !(
        response.path === '/api/v1/admin/session' &&
        response.method === 'GET' &&
        response.status === 401
      )
  )
  expect(unexpected).toEqual([])
  expect(results.errors).toEqual([])
  expect(results.networkFailures).toEqual([])
  for (const name of requested) {
    if (!results.cases.some((item) => item.name === name))
      results.cases.push({ name, status: 'NOT_RUN', reason: '本脚本尚未实现该场景' })
  }
  results.status = results.cases.some((item) => item.status === 'NOT_RUN') ? 'PARTIAL' : 'PASSED'
  if (results.status !== 'PASSED') process.exitCode = 1
} catch (error) {
  results.status = 'FAILED'
  // 不记录异常正文、输入值、Cookie、响应体或签名 URL
  results.failure = { stage: activeCase, type: error.name }
  process.exitCode = 1
} finally {
  await Promise.allSettled(responseReads)
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify(results, null, 2))
  await browser.close()
}
