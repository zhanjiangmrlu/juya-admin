import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('正式延期必须填写原因，限定有限自然月并核对暂停状态', async ({ adminApi, page }) => {
  const before = {
    id: 'FORMAL-1',
    user_id: 'USER-1',
    package_id: 'PACKAGE-1',
    package_name: '基础内容包',
    status: 'PAUSED',
    term: 'month_3',
    granted_at: '2026-09-29T00:00:00Z',
    expires_at: '2026-12-29T00:00:00Z',
    version: 1,
    available_operations: ['RENEW', 'EXTEND', 'RESUME', 'REVOKE']
  }
  let previewBody: unknown = null
  let commandBody: unknown = null
  await page.route('**/api/v1/admin/formal-entitlements/FORMAL-1', (route) =>
    route.fulfill({ json: before })
  )
  await page.route(
    '**/api/v1/admin/formal-entitlements/preview-operation?operation=EXTEND',
    (route) => {
      previewBody = route.request().postDataJSON()
      return route.fulfill({
        json: {
          before,
          after: { ...before, expires_at: '2027-03-29T00:00:00Z', version: 2 },
          actual_operation: 'EXTEND',
          expected_version: 1,
          previewed_at: '2026-10-13T03:00:00Z'
        }
      })
    }
  )
  await page.route('**/api/v1/admin/formal-entitlements/commands/EXTEND', (route) => {
    commandBody = route.request().postDataJSON()
    return route.fulfill({ json: { ...before, expires_at: '2027-03-29T00:00:00Z', version: 2 } })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/entitlements/formal/FORMAL-1/action?action=EXTEND')
  const preview = page.getByRole('button', { name: '获取延期预览', exact: true })
  await expect(preview).toBeDisabled()
  await page.getByLabel('延期原因', { exact: true }).fill('服务中断补偿')
  await page.locator('.operation-card .el-select').nth(1).click()
  await expect(page.getByRole('option', { name: '永久有效' })).toHaveCount(0)
  await page.getByRole('option', { name: '3 个自然月', exact: true }).click()
  await preview.click()
  const dialog = page.getByRole('dialog', { name: '确认延期', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('暂停状态保持不变')
  expect(previewBody).toMatchObject({ reason: '服务中断补偿', term: 'month_3' })
  await dialog.getByLabel('操作备注').fill('')
  await expect(dialog.getByRole('button', { name: '确认延期', exact: true })).toBeDisabled()
  await dialog.getByLabel('操作备注').fill('服务中断补偿')
  await dialog.getByRole('button', { name: '确认延期', exact: true }).click()
  await expect
    .poll(() => commandBody)
    .toMatchObject({ reason: '服务中断补偿', term: 'month_3', expected_version: 1 })
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('正式权益先预览再填写审计原因确认', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/entitlements/formal/grant')
  await page.getByPlaceholder('输入用户编号').fill('USER-1')
  await page.getByRole('combobox', { name: /正式内容包/ }).click()
  await page.getByRole('option', { name: /基础内容包/ }).click()
  await page.getByRole('button', { name: '获取操作预览' }).click()

  await expect(page.getByRole('dialog', { name: '确认开通内容' })).toBeVisible()
  await page.getByLabel('操作备注').fill('客服核验后补发')
  await page.getByRole('button', { name: '确认开通内容' }).click()
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
