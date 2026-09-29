import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('正式权益先预览再填写审计原因确认', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/entitlements/formal/grant')
  await page.getByPlaceholder('输入用户编号').fill('USER-1')
  await page.getByPlaceholder('输入内容包编号').fill('PACKAGE-1')
  await page.getByRole('button', { name: '获取服务端预览并二次确认' }).click()

  await expect(page.getByRole('dialog', { name: '确认正式权益操作' })).toBeVisible()
  await page.getByPlaceholder('请输入可审计的操作原因').fill('客服核验后补发')
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText('正式权益操作已完成')).toBeVisible()

  const preview = adminApi.findRequest(
    'POST',
    '/api/v1/admin/formal-entitlements/preview-operation'
  )
  expect(preview?.url).toContain('operation=GRANT')
  const command = adminApi.findRequest('POST', '/api/v1/admin/formal-entitlements/commands/GRANT')
  expect(command?.body).toMatchObject({ reason: '客服核验后补发', user_id: 'USER-1' })
  expect(command?.headers['x-csrf-token']).toBe('csrf-e2e')
  expect(command?.headers['x-idempotency-key']).toMatch(/^idem-/)
})
