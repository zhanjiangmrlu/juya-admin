import { expect, test } from '@playwright/test'

test('login keeps required fields, keyboard submission and authentication feedback', async ({
  page
}) => {
  let releaseResponse!: () => void
  const pendingResponse = new Promise<void>((resolve) => {
    releaseResponse = resolve
  })
  await page.route('**/api/admin/v1/auth/session', (route) =>
    route.fulfill({ status: 401, json: { detail: '未登录' } })
  )
  await page.route('**/api/admin/v1/auth/login', async (route) => {
    await pendingResponse
    await route.fulfill({
      status: 401,
      json: { error: { code: 'invalid_credentials', message: '账号或密码不正确，请重试' } }
    })
  })
  await page.goto('/login')
  const username = page.getByLabel('管理员账号', { exact: true })
  const password = page.getByLabel('密码', { exact: true })
  await page.getByRole('button', { name: '登录后台', exact: true }).click()
  await expect(username).toBeFocused()
  expect(await username.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(
    true
  )
  await username.fill('synthetic-admin')
  await password.fill('synthetic-password')
  await password.press('Enter')
  await expect(page.getByRole('button', { name: '正在登录…', exact: true })).toBeDisabled()
  await expect(username).toBeDisabled()
  await expect(password).toBeDisabled()
  releaseResponse()
  await expect(page.getByRole('alert')).toContainText('账号或密码不正确，请重试')
  await expect(username).toHaveValue('synthetic-admin')
  await expect(password).toHaveValue('synthetic-password')
  await expect(page.getByRole('button', { name: '登录后台', exact: true })).toBeEnabled()
  await expect(page).toHaveURL(/\/login$/)
})
