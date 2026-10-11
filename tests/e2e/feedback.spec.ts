import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('反馈补充要求提交可审计命令并刷新状态', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/feedback/FB-1/respond')
  await page.getByRole('combobox', { name: /结果模板/ }).press('Enter')
  await page.getByRole('option', { name: '需要补充', exact: true }).click()
  await page.getByLabel('回复补充说明').fill('请补充问题页面截图')
  await page.getByRole('button', { name: '需要补充' }).click()
  await expect(page.getByText('反馈处理结果已保存')).toBeVisible()

  const request = adminApi.findRequest(
    'POST',
    '/api/v1/admin/feedback/FB-1/commands/request-supplement'
  )
  expect(request?.body).toEqual({ request_text: '请补充问题页面截图' })
  expect(request?.headers['x-csrf-token']).toBe('csrf-e2e')
  await expect(page.locator('.status-tag').filter({ hasText: '等待用户补充' })).toBeVisible()
})
