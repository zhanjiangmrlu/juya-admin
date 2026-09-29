import { expect, loginAsAdmin, test } from './fixtures/admin-api'

test('密码与 TOTP 登录成功且 401 会清理会话', async ({ adminApi, page }) => {
  await loginAsAdmin(page)

  const passwordRequest = adminApi.findRequest('POST', '/api/v1/admin/session')
  expect(passwordRequest?.body).toEqual({ password: 'Admin-pass-2026', username: 'admin' })
  const totpRequest = adminApi.findRequest('POST', '/api/v1/admin/session/totp')
  expect(totpRequest?.body).toMatchObject({ challenge_id: 'challenge-e2e', code: '123456' })

  adminApi.unauthorizedPaths.add('/api/v1/admin/users')
  await page.goto('/users')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: '登录管理后台' })).toBeVisible()
})
