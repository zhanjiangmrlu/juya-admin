import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const fixturePath = process.env.JUYA_INTEGRATION06_FIXTURE || ''
const statePath = process.env.JUYA_INTEGRATION06_STATE || ''
test.skip(!fixturePath || !statePath, 'Requires an explicitly isolated integration06 local fixture')
test.use({ storageState: statePath || undefined })

test('direct categories, source review, optional vocabulary and per-item free access use real local HTTP', async ({
  page,
  baseURL
}, info) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname)
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    category_id: string
    article_id: string
    docx_path?: string
    zip_path?: string
  }
  await page.goto('/listening')
  await expect(page.getByRole('tab', { name: '文章管理', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '分类管理', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '主题管理', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '免费开放设置', exact: true })).toHaveCount(0)
  const row = page
    .locator('tbody tr')
    .filter({ has: page.locator(`a[href*="/listening/${fixture.article_id}"]`) })
  const free = row.locator('.free-access-control button')
  await expect(free).toBeVisible()
  const original = await free.innerText()
  await free.click()
  await expect(free).toHaveText(original.includes('关闭') ? '启用免费' : '关闭免费')
  await free.click()
  await expect(free).toHaveText(original)
  await page.screenshot({ path: info.outputPath('A01-list-1440.png'), fullPage: true })
  await page.goto(`/listening/category-order?category_id=${fixture.category_id}`)
  await expect(page.getByRole('button', { name: '保存顺序', exact: true })).toBeVisible()
  await page.goto(`/listening/${fixture.article_id}`)
  await expect(page.getByRole('combobox', { name: '所属分类', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '所属主题', exact: true })).toHaveCount(0)
  await page.getByTestId('add-vocabulary').click()
  const card = page.locator('.vocabulary-card').last()
  await expect(card.getByText('词汇 *', { exact: true })).toBeVisible()
  await expect(card.getByRole('combobox').first()).toBeVisible()
  await card.getByTestId('vocabulary-remove').click()
  await page.screenshot({ path: info.outputPath('A25-vocabulary-1440.png'), fullPage: true })
  if (fixture.docx_path) {
    const input = page.locator('input[type=file][accept=".docx"]')
    await expect(input).toBeEnabled()
    await input.setInputFiles(fixture.docx_path)
    const dialog = page.getByRole('dialog', { name: '核对DOCX带入变化' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/重点词汇/)).toBeVisible()
    await dialog.getByRole('button', { name: '取消带入', exact: true }).click()
  }
  if (fixture.zip_path) {
    await page.goto('/listening-imports')
    const input = page.locator('input[type=file]')
    await expect(input).toBeEnabled()
    await input.setInputFiles(fixture.zip_path)
    await expect(page.getByRole('heading', { name: '核对本批文章', exact: true })).toBeVisible()
    await expect(page.locator('.candidate')).not.toHaveCount(0)
    await expect(page.getByText(/重点词汇/).first()).toBeVisible()
    await page.screenshot({ path: info.outputPath('A18-import-review-1440.png'), fullPage: true })
  }
})
