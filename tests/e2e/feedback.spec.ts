import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('反馈补充要求提交可审计命令并刷新状态', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/feedback/FB-1/respond')
  await page.getByPlaceholder('说明需要补充的步骤、截图或环境信息').fill('请补充问题页面截图')
  await page.getByRole('button', { name: '发送补充要求' }).click()
  await expect(page.getByText('补充要求已发送')).toBeVisible()

  const request = adminApi.findRequest(
    'POST',
    '/api/v1/admin/feedback/FB-1/commands/request-supplement'
  )
  expect(request?.body).toEqual({ request_text: '请补充问题页面截图' })
  expect(request?.headers['x-csrf-token']).toBe('csrf-e2e')
  await expect(page.getByText('等待用户补充')).toBeVisible()
})
