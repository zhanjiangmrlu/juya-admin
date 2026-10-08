import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('审计、反馈时间线和核对管理员统一展示账号名', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  await loginAsAdmin(page)
  await navigateInApp(page, '/settings')
  await expect(
    page.locator('.audit-card').getByText('运营管理员账号', { exact: true })
  ).toBeVisible()
  await navigateInApp(page, '/feedback/FB-1')
  await expect(
    page.locator('.audit-timeline').getByText('反馈管理员账号', { exact: true })
  ).toBeVisible()
  await expect(
    page.locator('.audit-timeline').getByText('用户 · USER-1', { exact: true })
  ).toBeVisible()
  await navigateInApp(page, '/users/USER-1')
  await expect(page.getByText('核对管理员：核对管理员账号', { exact: true })).toBeVisible()
})
