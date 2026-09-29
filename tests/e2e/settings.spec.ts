import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('配置冲突展示远端版本并保留本地草稿', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  adminApi.conflictOnNextSettingsUpdate()
  await navigateInApp(page, '/settings')
  await expect(page.getByRole('heading', { level: 2, name: '系统配置' })).toBeVisible()
  const feedbackHours = page.getByRole('spinbutton').first()
  await feedbackHours.fill('48')
  await page.getByRole('button', { name: '保存配置' }).click()

  await expect(page.getByRole('dialog', { name: '配置版本冲突' })).toBeVisible()
  await expect(page.getByText('远端版本 v4')).toBeVisible()
  await expect(page.getByText('"feedbackSlaHours": 48')).toBeVisible()
  const request = adminApi.requests.find(
    (item) => item.method === 'PATCH' && item.pathname.startsWith('/api/v1/admin/settings/')
  )
  expect(request?.body).toMatchObject({ expected_version: 3 })
  expect(request?.headers['x-csrf-token']).toBe('csrf-e2e')
})
