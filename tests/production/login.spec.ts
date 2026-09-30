import { expect, test } from '@playwright/test'

test('生产构建的登录页首次打开和刷新均正常渲染且无脚本错误', async ({ page }) => {
  const scriptErrors: string[] = []
  page.on('pageerror', (error) => scriptErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') scriptErrors.push(message.text())
  })

  await page.goto('/login')
  expect(scriptErrors).toEqual([])
  await expect(page.getByRole('heading', { name: '登录管理后台' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '管理员账号' })).toBeVisible()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeDisabled()

  await page.reload()
  await expect(page.getByRole('heading', { name: '登录管理后台' })).toBeVisible()
  expect(scriptErrors).toEqual([])
  await page.screenshot({ fullPage: true, path: test.info().outputPath('login.png') })
})
