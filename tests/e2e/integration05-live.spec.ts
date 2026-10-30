import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const fixturePath = process.env.JUYA_INTEGRATION05_FIXTURE || ''
const statePath = process.env.JUYA_INTEGRATION05_STATE || ''
test.skip(!fixturePath || !statePath, 'Requires an explicitly isolated integration05 local fixture')
test.use({ storageState: statePath || undefined })

test('current-page catalog selection, reference safety and direct M save work through local HTTP', async ({
  page,
  baseURL
}, info) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname)
  await page.goto('/listening/categories')
  await expect(page.locator('tbody tr')).toHaveCount(10)
  await page.getByLabel('全选当前页分类').check()
  await expect(page.getByText('已选当前页10个分类', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await expect(page.locator('tbody input:checked')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('A02-categories-1440.png'), fullPage: true })
  await page.goto('/listening/topics')
  await expect(page.locator('tbody').getByText('Everyday English', { exact: true })).toBeVisible()
  await page.locator('tbody tr').first().getByRole('button', { name: '删除', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /确认删除/ }).click()
  await expect(page.getByText(/仍有.*引用|有文章.*引用|引用.*不能删除/)).toBeVisible()
  await page.screenshot({ path: info.outputPath('A02-D-referenced.png'), fullPage: true })
  await page.goto('/listening')
  await page.getByRole('button', { name: '免费开放设置', exact: true }).click()
  await page.getByLabel('免费篇数M', { exact: false }).fill('1')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText(/当前听读免费1篇/)).toBeVisible()
  await page.setViewportSize({ width: 960, height: 900 })
  await page.screenshot({ path: info.outputPath('A01-list-960.png'), fullPage: true })
})

test('ZIP review exposes both exits, isolates DOCX failure and directly publishes qualified items', async ({
  page
}, info) => {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  await page.goto('/listening-imports')
  await page.locator('input[type=file]').setInputFiles(fixture.browser_zip)
  await expect(page.getByRole('heading', { name: '核对本批文章', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存为草稿', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /发布所选合格文章/ })).toBeVisible()
  await expect(page.locator('.review-table')).toContainText('无法读取')
  const row = page
    .locator('.review-table tbody tr')
    .filter({ hasText: '本地浏览器双出口验证' })
    .first()
  await row.getByRole('button', { name: '核对 / 补充资料', exact: true }).click()
  await expect(page.locator('.candidate-editor')).toBeVisible()
  await page.setViewportSize({ width: 960, height: 900 })
  await page.locator('.review-table').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await page.screenshot({ path: info.outputPath('A19-review-960.png'), fullPage: true })
  await page.getByRole('button', { name: /保存到本批暂存/ }).click()
  await page.getByRole('button', { name: /发布所选合格文章/ }).click()
  await expect(page).toHaveURL(/\/listening$/)
  await expect(
    page.locator('tbody').getByText('本地浏览器双出口验证', { exact: true })
  ).toBeVisible()
})
