import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const root = process.env.JUYA_IMPORT_VERIFY_DIR || ''
const credentials = root ? JSON.parse(readFileSync(`${root}/credentials.json`, 'utf8')) : {}
const seed = root ? JSON.parse(readFileSync(`${root}/seed.json`, 'utf8')) : {}
test.skip(!root, 'Requires the disposable design verification API and seeded records')

test('seven admin routes retain their layout, assets and long-page actions at desktop sizes', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1024 })
  await page.goto('/login')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: 'test-results/design-login.png' })
  await page.getByLabel('管理员账号').fill(credentials.username)
  await page.getByLabel('密码', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  await page.goto('/cards?search=晨间')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: 'test-results/design-cards.png' })
  await page
    .locator('tbody tr')
    .filter({ hasText: '已发布' })
    .first()
    .getByRole('button', { name: '查看效果', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.preview-scroll')).toBeVisible()
  expect(
    await page
      .locator('.preview-scroll')
      .evaluate((element) => element.scrollHeight > element.clientHeight)
  ).toBe(true)
  await expect(page.getByRole('button', { name: '关闭预览', exact: true })).toBeInViewport()
  await page.screenshot({ path: 'test-results/design-preview.png' })
  await page.getByRole('button', { name: '关闭预览', exact: true }).click()
  await page.goto(`/cards/${seed.cards[0]}`)
  await expect(page.getByLabel('中文标题', { exact: true })).not.toHaveValue('')
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeInViewport()
  await page.screenshot({ path: 'test-results/design-editor.png', fullPage: true })
  await page.goto('/imports')
  await expect(page.getByLabel('选择多个ZIP')).toBeAttached()
  await page.screenshot({ path: 'test-results/design-imports.png' })
  await page.goto('/users')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/design-users.png' })
  await page.goto(`/users/${seed.users[1]}`)
  await expect(page.getByRole('heading', { name: '账号资料', exact: true })).toBeVisible()
  await expect(page.locator('.learning-records tbody tr').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/design-user-detail.png', fullPage: true })
  await page.goto('/statistics')
  await expect(page.locator('.metric-value')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/design-statistics.png' })
  for (const width of [1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1024 })
    for (const route of [
      '/cards?search=晨间',
      '/imports',
      '/users',
      '/statistics',
      `/cards/${seed.cards[0]}`,
      `/users/${seed.users[1]}`
    ]) {
      await page.goto(route)
      await expect(page.locator('h1')).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true)
      await expect
        .poll(() =>
          page
            .locator('img')
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0
              )
            )
        )
        .toBe(true)
    }
    await page.screenshot({ path: `test-results/design-responsive-${width}.png` })
  }
  expect(errors).toEqual([])
})
