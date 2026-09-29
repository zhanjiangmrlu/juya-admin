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
  expect(request?.body).toEqual({ wechat_id: 'juya_private_wechat' })
  expect(page.url()).not.toContain('juya_private_wechat')
  await expect(page.getByText('USER-1')).toBeVisible()
})
