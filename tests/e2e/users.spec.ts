import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('完整微信号通过 POST 正文查询且不会进入地址栏', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/users')
  const searchMode = page.getByRole('combobox', { name: '搜索方式' })
  await searchMode.press('ArrowDown')
  await searchMode.press('End')
  await searchMode.press('Enter')
  await page.getByPlaceholder('输入完整微信号').fill('juya_private_wechat')
  await page.getByRole('button', { name: '查询' }).click()

  await expect
    .poll(() => adminApi.findRequest('POST', '/api/v1/admin/users/search-by-wechat'))
    .toBeTruthy()
  const request = adminApi.findRequest('POST', '/api/v1/admin/users/search-by-wechat')
  expect(request?.body).toEqual({ wechat_id: 'juya_private_wechat', page: 1, page_size: 10 })
  expect(page.url()).not.toContain('juya_private_wechat')
  expect(
    await page.evaluate(
      () => `${localStorage.getItem('wechat_id')}${sessionStorage.getItem('wechat_id')}`
    )
  ).not.toContain('juya_private_wechat')
  await expect(page.getByText('USER-1')).toBeVisible()
})

test('联系状态筛选、学习概况和审计后复制形成真实用户流程', async ({ adminApi, context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await loginAsAdmin(page)
  await navigateInApp(page, '/users')

  const statusFilter = page.getByRole('combobox', { name: '联系状态筛选' })
  await statusFilter.press('ArrowDown')
  await page.getByRole('option', { name: '已联系' }).click()

  await expect
    .poll(() =>
      adminApi.requests.find((request) => request.url.includes('contact_status=CONTACTED'))
    )
    .toBeTruthy()
  await expect(page.getByText('juya_verified').first()).toBeVisible()

  await page.getByRole('button', { name: '查看', exact: true }).click()
  await expect(page).toHaveURL(/\/users\/USER-1$/)
  await expect(page.getByText('开放场景完成数')).toBeVisible()
  await expect(page.getByText('12', { exact: true })).toBeVisible()
  await expect(page.getByText('4', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '复制', exact: true }).click()
  await expect(page.getByText('微信号已复制，审计记录已保存')).toBeVisible()
  const copyRequest = adminApi.findRequest('POST', '/api/v1/admin/users/USER-1/contact-copy-events')
  expect(copyRequest?.headers['x-csrf-token']).toBe('csrf-e2e')
})

test('联系更正列表进入详情并以幂等命令批准', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/users')
  await page.getByRole('button', { name: '查看联系更正申请' }).click()
  await expect(page.getByText('申请重新修改微信号')).toBeVisible()
  await page.getByRole('button', { name: '处理' }).click()

  await expect(page).toHaveURL(/\/contacts\/corrections\/COR-1$/)
  await expect(page.getByText('juya_verified')).toBeVisible()
  await page.getByRole('button', { name: '批准并重置修改机会' }).click()
  await page.getByRole('button', { name: '确认批准' }).click()

  await expect(page.getByText('APPROVED')).toBeVisible()
  const request = adminApi.findRequest(
    'POST',
    '/api/v1/admin/contact-corrections/COR-1/commands/approve'
  )
  expect(request?.headers['x-csrf-token']).toBe('csrf-e2e')
  expect(request?.headers['x-idempotency-key']).toMatch(/^idem-/)
})

test('更正决定 409 时保留详情并提示刷新', async ({ adminApi, page }) => {
  adminApi.conflictOnNextContactDecision()
  await loginAsAdmin(page)
  await navigateInApp(page, '/contacts/corrections/COR-1')
  await expect(page.getByText('juya_verified')).toBeVisible()

  await page.getByRole('button', { name: '拒绝', exact: true }).click()
  await page.getByRole('button', { name: '确认拒绝' }).click()

  await expect(page.getByText('申请状态已变化，请刷新后重试')).toBeVisible()
  await expect(page.getByText('juya_verified')).toBeVisible()
  expect(
    adminApi.findRequest('POST', '/api/v1/admin/contact-corrections/COR-1/commands/reject')
  ).toBeTruthy()
})
