import { pageManifest } from '../visual/page-manifest'
import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('A01–A26 全部业务页具备真实接口状态且没有待接入或未知请求', async ({ adminApi, page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await loginAsAdmin(page)
  for (const item of pageManifest) {
    await navigateInApp(page, item.path)
    await expect(page.getByRole('heading', { level: 1, name: item.title })).toBeVisible()
    await expect(page.getByText(/接口待接入|页面开发中/)).toHaveCount(0)
  }
  expect(adminApi.unexpectedRequests).toEqual([])
  expect(errors).toEqual([])
})

test('A25 按日周月查询、显示真实比率分子分母并下载已校验汇总', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/analytics')
  await expect(page.getByRole('img', { name: '匿名汇总指标趋势图' })).toBeVisible()
  for (const [label, period] of [
    ['按周', 'week'],
    ['按月', 'month'],
    ['按日', 'day']
  ]) {
    await page.getByRole('combobox', { name: '统计周期' }).focus()
    await page.getByRole('combobox', { name: '统计周期' }).press('Enter')
    await page.getByRole('option', { name: label }).click()
    await expect
      .poll(
        () =>
          adminApi.requests.filter((item) => item.pathname === '/api/v1/admin/analytics').at(-1)
            ?.url
      )
      .toContain(`period=${period}`)
    await expect(page.getByText('80.0%', { exact: true })).toBeVisible()
    await expect(page.getByText('SLA 内处理数量 / 纳入 SLA 统计的反馈数量')).toBeVisible()
  }
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出已校验数据' }).click()
  expect((await download).suggestedFilename()).toMatch(/^juya-analytics-.*\.json$/)
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('A26 冲突关闭后草稿可使用远端版本重新提交', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/settings')
  const hours = page.getByRole('spinbutton').first()
  await expect(hours).toHaveValue('24')
  await expect(hours).toBeEnabled()
  await hours.fill('48')
  adminApi.conflictOnNextSettingsUpdate()
  await page.getByRole('button', { name: '保存配置' }).click()
  const dialog = page.getByRole('dialog', { name: '配置版本冲突' })
  await expect(dialog.getByText('远端版本 v4')).toBeVisible()
  await dialog.getByRole('button', { name: 'Close this dialog' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(hours).toHaveValue('48')
  await page.getByRole('button', { name: '保存配置' }).click()
  await expect(page.getByText('系统配置已保存')).toBeVisible()
  const writes = adminApi.requests.filter(
    (item) => item.method === 'PATCH' && item.pathname.endsWith('/feedback_sla_hours')
  )
  expect(writes.at(-1)?.body).toMatchObject({ expected_version: 4, value: { value: 48 } })
})

test('A26 首次读取挂起或失败时不可编辑和假保存，失败后可以重试', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  let finish!: () => void
  await page.route('**/api/v1/admin/settings', async (route) => {
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'UNAVAILABLE',
        message: '配置读取失败',
        request_id: 'r1'
      })
    })
  })
  await navigateInApp(page, '/settings')
  const save = page.getByRole('button', { name: '保存配置' })
  await expect(save).toBeDisabled()
  await expect(page.getByRole('spinbutton').first()).toBeDisabled()
  finish()
  await expect(page.getByText('系统配置已保存')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新读取配置' })).toBeVisible()
  await expect(save).toBeDisabled()
  await page.unroute('**/api/v1/admin/settings')
  await page.getByRole('button', { name: '重新读取配置' }).click()
  await expect(save).toBeEnabled()
  await expect(page.getByRole('spinbutton').first()).toBeEnabled()
  expect(adminApi.requests.filter((item) => item.method === 'PATCH')).toEqual([])
})
