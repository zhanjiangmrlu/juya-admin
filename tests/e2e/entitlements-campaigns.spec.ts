import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test.afterEach(({ adminApi }) => {
  expect(adminApi.unexpectedRequests).toEqual([])
})

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 }
]

test('A07 conflict keeps latest version unknown after list-only retry', async ({
  adminApi,
  page
}) => {
  let detailRequests = 0
  await loginAsAdmin(page)
  await page.route('**/api/v1/admin/campaigns/CAMP-1', async (route) => {
    detailRequests += 1
    if (detailRequests === 1) return route.fallback()
    return route.fulfill({
      status: 503,
      json: {
        code: 'SERVICE_UNAVAILABLE',
        message: '活动详情暂不可用',
        request_id: 'req-detail-503'
      }
    })
  })
  await page.route('**/api/v1/admin/limited-entitlements/commands/grant', async (route) => {
    expect(route.request().method()).toBe('POST')
    return route.fulfill({
      status: 409,
      json: {
        code: 'CAMPAIGN_STATE_CONFLICT',
        message: '活动状态已变化',
        request_id: 'req-grant-conflict'
      }
    })
  })
  await navigateInApp(page, '/entitlements/limited/grant')
  await page.getByPlaceholder('输入用户编号').fill('USER-1')
  await page.getByRole('combobox', { name: /开放中的活动/ }).click()
  await page.getByRole('option', { name: /秋季限时学习/ }).click()
  await expect(page.getByText('VERSION-1')).toBeVisible()
  await page.getByRole('button', { name: '二次确认并开通' }).click()
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText(/服务端最新版本：暂未获取，请刷新/)).toBeVisible()
  expect(detailRequests).toBe(2)
  await page.getByRole('button', { name: '重新加载活动列表', exact: true }).click()
  await expect
    .poll(
      () =>
        adminApi.requests.filter(
          (request) => request.method === 'GET' && request.pathname === '/api/v1/admin/campaigns'
        ).length
    )
    .toBe(2)
  expect(detailRequests).toBe(2)
  await expect(page.getByText(/服务端最新版本：暂未获取，请刷新/)).toBeVisible()
  await expect(page.getByText(/服务端最新版本：v3/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '二次确认并开通' })).toBeDisabled()
})

for (const viewport of viewports) {
  test(`A05–A12 real API pages fit ${viewport.width}×${viewport.height}`, async ({
    adminApi,
    page
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await loginAsAdmin(page)
    const routes = [
      ['/entitlements', '统一权益中心', 'A05'],
      ['/entitlements/formal/grant', '授予正式内容包', 'A06'],
      ['/entitlements/limited/grant', '开通限时学习权益', 'A07'],
      ['/entitlements/formal/FORMAL-1/action', '正式权益操作', 'A08'],
      ['/entitlements/limited/LIMITED-1/action', '限时权益操作', 'A09'],
      ['/campaigns', '限时活动列表', 'A10'],
      ['/campaigns/CAMP-1/edit', '限时活动编辑', 'A11'],
      ['/campaigns/CAMP-1/versions', '活动版本与容量', 'A12']
    ] as const
    for (const [path, heading, number] of routes) {
      await navigateInApp(page, path)
      await expect(page.getByRole('heading', { name: new RegExp(heading), level: 2 })).toBeVisible()
      if (number === 'A05') await expect(page.getByRole('cell', { name: 'FORMAL-1' })).toBeVisible()
      if (number === 'A06') {
        await page.getByRole('combobox', { name: /正式内容包/ }).click()
        await page.getByRole('option', { name: /基础内容包/ }).click()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('option', { name: /基础内容包/ })).toBeHidden()
      }
      if (number === 'A07') {
        await page.getByPlaceholder('输入用户编号').fill('USER-1')
        await page.getByRole('combobox', { name: /开放中的活动/ }).click()
        await page.getByRole('option', { name: /秋季限时学习/ }).click()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('option', { name: /秋季限时学习/ })).toBeHidden()
        await expect(page.getByText('VERSION-1')).toBeVisible()
      }
      if (number === 'A08' || number === 'A09' || number === 'A11')
        await expect(page.getByText('v1').or(page.getByText('v3'))).toBeVisible()
      if (number === 'A10') await expect(page.getByRole('cell', { name: 'CAMP-1' })).toBeVisible()
      if (number === 'A12') await expect(page.getByText('VERSION-1')).toBeVisible()
      await expect(page.locator('main')).not.toContainText('接口待接入')
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
        .toBeLessThanOrEqual(0)
      await page.screenshot({
        path: testInfo.outputPath(`${number}-${viewport.width}.png`),
        fullPage: true
      })
    }
    expect(adminApi.findRequest('GET', '/api/v1/admin/entitlements')).toBeDefined()
    expect(adminApi.findRequest('GET', '/api/v1/admin/content-packages')).toBeDefined()
    expect(adminApi.findRequest('GET', '/api/v1/admin/campaigns')).toBeDefined()
    expect(adminApi.findRequest('GET', '/api/v1/admin/campaigns/CAMP-1')).toBeDefined()
  })
}

test('campaign 409 preserves draft and displays latest server version', async ({
  adminApi,
  page
}) => {
  adminApi.setCampaignStatus('DRAFT')
  await loginAsAdmin(page)
  await navigateInApp(page, '/campaigns/CAMP-1/edit')
  const name = page.getByRole('textbox', { name: '活动名称' })
  await expect(name).toHaveValue('秋季限时学习')
  await name.fill('管理员尚未提交的修改')
  adminApi.conflictOnNextCampaignSave()
  await page.getByRole('button', { name: '保存活动' }).click()
  await expect(page.getByText(/草稿已保留。服务端最新版本：v4/)).toBeVisible()
  await expect(name).toHaveValue('管理员尚未提交的修改')
  expect(
    adminApi.findRequest('PUT', '/api/v1/admin/campaigns/CAMP-1')?.headers['x-idempotency-key']
  ).toMatch(/^idem-/)
})

test('capacity command uses server version, confirmation and idempotency key', async ({
  adminApi,
  page
}) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/campaigns/CAMP-1/versions')
  await expect(page.getByText('v3')).toBeVisible()
  await page.getByRole('spinbutton').fill('35')
  await page.getByRole('button', { name: '确认调整容量' }).click()
  await expect(page.getByRole('dialog', { name: '确认容量调整' })).toBeVisible()
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText('容量已更新')).toBeVisible()
  const request = adminApi.findRequest('POST', '/api/v1/admin/campaigns/CAMP-1/commands/capacity')
  expect(request?.body).toEqual({ expected_version: 3, capacity: 35 })
  expect(request?.headers['x-idempotency-key']).toMatch(/^idem-/)
})

test('campaign creation and version copy use real write routes', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/campaigns/new/edit')
  await page.getByRole('textbox', { name: '活动名称' }).fill('新建学习活动')
  await page.getByRole('textbox', { name: /场景顺序/ }).fill('SCENE-1')
  await page.getByRole('button', { name: '保存活动' }).click()
  await expect(page).toHaveURL(/\/campaigns\/CAMP-1\/edit$/)
  const create = adminApi.findRequest('POST', '/api/v1/admin/campaigns')
  expect(create?.body).toMatchObject({
    name: '新建学习活动',
    duration_days: 3,
    activation_window_days: 7,
    capacity: 1,
    scene_ids: ['SCENE-1']
  })
  expect(create?.headers['x-idempotency-key']).toMatch(/^idem-/)
  await page.getByRole('button', { name: '复制新版本' }).click()
  await expect(page.getByRole('dialog', { name: '确认活动操作' })).toBeVisible()
  await page.getByRole('button', { name: '确认执行' }).click()
  expect(
    adminApi.findRequest('POST', '/api/v1/admin/campaigns/CAMP-1/versions/copy')?.body
  ).toEqual({ expected_version: 1 })
})
