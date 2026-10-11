import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('A26 saves all four reversible modules with their own versions and reads them back', async ({
  page,
  adminApi
}) => {
  const labels = ['场景学习', '短文阅读', '长难句分析', '语法']
  const types = ['scene_learning', 'short_reading', 'long_sentence', 'grammar']
  const rows = types.map((module_type, index) => ({
    module_type,
    display_name: labels[index],
    sort_order: index,
    enabled: false,
    config_version: 1,
    ready: true,
    reason: null,
    entry_path: `/pages/${module_type}`
  }))
  const commands: { body: Record<string, unknown>; key: string | undefined }[] = []
  await page.route('**/api/v1/admin/content/learning-modules**', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') return route.fulfill({ json: { items: rows } })
    const row = rows.find((item) => request.url().endsWith(item.module_type))!
    const body = request.postDataJSON()
    expect(body.expected_version).toBe(row.config_version)
    expect(body).not.toHaveProperty('ready')
    commands.push({ body, key: request.headers()['idempotency-key'] })
    row.enabled = body.enabled
    row.config_version++
    return route.fulfill({ json: row })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/settings/learning-modules')
  for (const enabled of [true, false]) {
    for (const label of labels)
      await page
        .locator('.module-row .el-switch')
        .filter({ has: page.getByRole('switch', { name: `${label}启用`, exact: true }) })
        .click()
    await page.getByRole('button', { name: '保存模块配置', exact: true }).click()
    await expect(page.getByText('模块配置已保存', { exact: true })).toBeVisible()
    await page.reload()
    for (const label of labels)
      await expect(page.getByRole('switch', { name: `${label}启用`, exact: true })).toHaveAttribute(
        'aria-checked',
        String(enabled)
      )
  }
  expect(commands).toHaveLength(8)
  expect(commands.every((command) => command.key)).toBe(true)
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('A23 uses published titles and short trial CAS state without clearing failed inputs', async ({
  page,
  adminApi
}) => {
  let trial = true
  let version = 4
  const writes: { body: unknown; key: string | undefined }[] = []
  await page.route('**/api/v1/admin/content/short-readings**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/trial')) {
      const body = request.postDataJSON()
      writes.push({ body, key: request.headers()['idempotency-key'] })
      expect(body.expected_version).toBe(version)
      if (writes.length === 1) return route.abort('failed')
      trial = body.enabled
      version++
      return route.fulfill({ json: { version } })
    }
    if (url.pathname.includes('/revisions/'))
      return route.fulfill({
        json: {
          content_snapshot: { title_en: 'A Real Published Reading', title_zh: '真实已发布短文' }
        }
      })
    expect(url.searchParams.get('status')).toBe('PUBLISHED')
    return route.fulfill({
      json: {
        items: [
          {
            public_id: 'READ-1',
            status: 'PUBLISHED',
            published_revision_id: 'PUB-1',
            draft_revision_id: 'DRAFT-2',
            version,
            trial_enabled: trial
          }
        ],
        total: 1
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/discovery-config')
  const toggle = page.getByRole('switch', {
    name: 'A Real Published Reading｜真实已发布短文开放试读'
  })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await page.locator('.trial-row .el-switch').click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText('修改尚未保存')).toBeVisible()
  await page.getByRole('button', { name: '重试保存试读', exact: true }).click()
  await expect(page.getByText('修改尚未保存')).toBeHidden()
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await page.locator('.trial-row .el-switch').click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(writes.map((write) => write.body)).toEqual([
    { expected_version: 4, enabled: false },
    { expected_version: 4, enabled: false },
    { expected_version: 5, enabled: true }
  ])
  expect(writes.every((write) => write.key)).toBe(true)
  expect(writes[1]).toEqual(writes[0])
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('latest operations frames keep controls and fields visible across viewports', async ({
  page,
  adminApi
}, testInfo) => {
  await page.route('**/api/v1/admin/content/short-readings**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } })
  )
  await loginAsAdmin(page)
  test.setTimeout(90_000)
  const routes = [
    ['A11', '/campaigns/CAMP-1/edit'],
    ['A12', '/campaigns/CAMP-1/versions'],
    ['A06', '/entitlements/formal/grant'],
    ['A08', '/entitlements/formal/FORMAL-1/action'],
    ['A08P', '/entitlements/formal/FORMAL-1/action?action=PAUSE'],
    ['A15', '/feedback/FB-1'],
    ['A23', '/content/discovery-config'],
    ['A26', '/settings/learning-modules']
  ] as const
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
    { width: 600, height: 800 }
  ]) {
    await page.setViewportSize(viewport)
    for (const [frame, route] of routes) {
      await navigateInApp(page, route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const ready: Record<string, string> = {
        A11: '.campaign-edit-page .basic-form',
        A12: '.campaign-version-page .scene-order',
        A06: '.formal-grant-page .editor-card',
        A08: '.formal-action-page .operation-card',
        A08P: '.formal-action-page .operation-card',
        A15: '.feedback-detail-page .source-card',
        A23: '.discovery-config-page .open-scenes-grid',
        A26: '.learning-modules-page .module-row'
      }
      await expect(page.locator(ready[frame]!).first()).toBeVisible()
      if (frame === 'A08P')
        await expect(page.getByRole('button', { name: '获取暂停预览', exact: true })).toBeVisible()
      await expect(page.locator('.app-page-actions')).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
        .toBeLessThanOrEqual(0)
      if (frame === 'A06') {
        await page.getByPlaceholder('输入用户编号').fill('USER-1')
        await page.getByRole('combobox', { name: /正式内容包/ }).click()
        await page.getByRole('option', { name: /基础内容包/ }).click()
        await page.getByRole('button', { name: '获取操作预览', exact: true }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
      }
      if (frame === 'A08' || frame === 'A08P') {
        await page
          .getByRole('button', {
            name: frame === 'A08' ? '获取续期预览' : '获取暂停预览',
            exact: true
          })
          .click()
        await expect(
          page.getByRole('dialog', { name: frame === 'A08' ? '确认续期' : '确认暂停', exact: true })
        ).toBeVisible()
      }
      await page.screenshot({
        path: testInfo.outputPath(`${frame}-${viewport.width}.png`),
        fullPage: true,
        animations: 'disabled'
      })
      if (frame === 'A06' || frame === 'A08' || frame === 'A08P')
        await page.getByRole('button', { name: '返回修改', exact: true }).click()
    }
  }
  expect(adminApi.unexpectedRequests).toEqual([])
})
