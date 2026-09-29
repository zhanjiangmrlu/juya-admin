import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('反馈列表支持筛选分页并进入完整详情', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/feedback')

  await expect(page.getByText('FB-1')).toBeVisible()
  await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
  await expect(page.locator('.feedback-table').getByText('处理中', { exact: true })).toBeVisible()
  await expect(page.locator('.feedback-table').getByText('时限正常', { exact: true })).toBeVisible()
  await expect(page.locator('img[src="x"]')).toHaveCount(0)

  await page.getByPlaceholder('反馈编号或用户编号').fill('USER-1')
  await page.locator('.filter-bar .el-select').first().click()
  await page.getByRole('option', { name: '处理中' }).click()
  await page.getByRole('button', { name: '查询' }).click()

  const request = adminApi.requests.find(
    (item) =>
      item.method === 'GET' &&
      item.pathname === '/api/v1/admin/feedback' &&
      item.url.includes('keyword=USER-1')
  )
  expect(request?.url).toContain('status=PROCESSING')

  await page.locator('button.btn-next').click()
  await expect(page).toHaveURL(/page=2/)
  const secondPage = adminApi.requests.find(
    (item) =>
      item.method === 'GET' &&
      item.pathname === '/api/v1/admin/feedback' &&
      item.url.includes('page=2')
  )
  expect(secondPage?.url).toContain('keyword=USER-1')

  await page.getByRole('link', { name: 'FB-1' }).click()
  await expect(page).toHaveURL(/\/feedback\/FB-1$/)
  await expect(page.getByText('开始处理')).toBeVisible()
})

test('反馈截图每次重新签发且地址不进入浏览器持久化', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/feedback/FB-1')

  await page.getByRole('button', { name: '查看反馈截图' }).click()
  const firstSource = await page.getByAltText('反馈截图').getAttribute('src')
  await page.getByRole('button', { name: '刷新临时地址' }).click()
  await expect(page.getByAltText('反馈截图')).toHaveAttribute('src', /version=2/)
  const secondSource = await page.getByAltText('反馈截图').getAttribute('src')

  expect(firstSource).not.toBe(secondSource)
  expect(
    adminApi.requests.filter(
      (item) =>
        item.method === 'POST' && item.pathname === '/api/v1/admin/feedback/FB-1/screenshot-url'
    )
  ).toHaveLength(2)
  const persisted = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage })
  )
  expect(persisted).not.toContain('signed.example')
})

test('内部备注失败保留草稿，成功后进入管理员可见记录', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/feedback/FB-1/respond')

  const input = page.getByPlaceholder('最多 200 字，仅管理员可见')
  await input.fill('需要继续排查音频时间轴')
  await page.getByRole('button', { name: '保存内部备注' }).click()

  const request = adminApi.findRequest('POST', '/api/v1/admin/feedback/FB-1/internal-notes')
  expect(request?.body).toEqual({ content: '需要继续排查音频时间轴' })
  expect(request?.headers['x-csrf-token']).toBe('csrf-e2e')
  expect(request?.headers['x-idempotency-key']).toBeTruthy()
  await expect(page.getByText('内部备注已保存')).toBeVisible()
  await expect(input).toHaveValue('')
  await page.getByRole('button', { name: '返回反馈详情' }).click()
  await expect(page.getByText('需要继续排查音频时间轴')).toBeVisible()
})

test('A14 至 A16 在双视口下保持关键内容和无横向溢出', async ({ adminApi, page }, testInfo) => {
  await loginAsAdmin(page)
  const pages = [
    { heading: '问题反馈列表', path: '/feedback', slug: 'a14' },
    { heading: '问题反馈详情', path: '/feedback/FB-1', slug: 'a15' },
    { heading: '反馈回复与关闭', path: '/feedback/FB-1/respond', slug: 'a16' }
  ]
  for (const viewport of [
    { height: 900, width: 1440 },
    { height: 800, width: 1280 }
  ]) {
    await page.setViewportSize(viewport)
    for (const target of pages) {
      await navigateInApp(page, target.path)
      await expect(
        page.getByRole('heading', { level: 2, name: new RegExp(target.heading) })
      ).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true)
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(`${target.slug}-${viewport.width}x${viewport.height}.png`)
      })
    }
  }
  expect(adminApi.unexpectedRequests).toEqual([])
})
