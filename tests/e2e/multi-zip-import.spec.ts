import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import type { Page } from '@playwright/test'

const root = process.env.JUYA_IMPORT_VERIFY_DIR || ''
const settings = root ? JSON.parse(readFileSync(join(root, 'credentials.json'), 'utf8')) : {}
test.skip(!root, 'Requires an isolated API/worker and generated ZIP fixtures')

/** 使用隔离管理员登录并创建ZIP批次
 * @param page 当前浏览器页面
 */
const begin = async (page: Page) => {
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill(settings.username)
  await page.getByLabel('密码', { exact: true }).fill(settings.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: '业务导航' })
    .getByRole('link', { name: '批量导入', exact: true })
    .click()
}
/** 等待所有已接收资料解析后进入核对
 * @param page 当前批次页面
 */
const review = async (page: Page) => {
  const next = page.getByRole('button', { name: '进入核对', exact: true })
  await expect(next).toBeEnabled({ timeout: 25000 })
  await next.click()
  await expect(page.locator('.review-list')).toBeVisible()
}
/** 保存当前勾选范围并等待逐卡结果
 * @param page 当前批次页面
 * @param count 本次应实际保存的卡片数
 */
const save = async (page: Page, count: number) => {
  await page.locator('[data-action="review-next"]').click()
  await expect(page.getByText(`将保存${count}张草稿`, { exact: false })).toBeVisible()
  await page.locator('[data-action="save-import"]').click()
  await expect(page.locator('.result-summary')).toContainText(`成功 ${count}`, { timeout: 25000 })
}

test('three ZIPs can be selected, removed, appended, reviewed and saved as three drafts', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await begin(page)
  const input = page.locator('input[type="file"][accept=".zip"]').first()
  await input.setInputFiles(
    ['first.zip', 'second.zip', 'third.zip'].map((name) => join(root, name))
  )
  await expect(page.locator('.file-list li')).toHaveCount(3)
  await page
    .locator('.file-list li')
    .filter({ hasText: 'third.zip' })
    .getByRole('button', { name: '移除', exact: true })
    .click()
  await expect(page.locator('.file-list li')).toHaveCount(2)
  await input.setInputFiles(join(root, 'third.zip'))
  await page.locator('[data-action="start-upload"]').click()
  await review(page)
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(3)
  for (const name of ['first.zip', 'second.zip', 'third.zip'])
    await expect(page.locator('.review-list')).toContainText(name)
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/multi-zip-review.png',
    fullPage: true
  })
  await page
    .locator('.review-list tr[data-item-id]')
    .filter({ hasText: '多ZIP甲' })
    .getByRole('button', { name: '展开核对' })
    .click()
  await page.getByLabel('中文标题', { exact: true }).fill('多ZIP甲-已核对')
  await page
    .locator('.review-list tr[data-item-id]')
    .filter({ hasText: '多ZIP乙' })
    .getByRole('button', { name: '展开核对' })
    .click()
  await page
    .locator('.review-list tr[data-item-id]')
    .filter({ hasText: '多ZIP甲-已核对' })
    .getByRole('button', { name: '展开核对' })
    .click()
  await expect(page.getByLabel('中文标题', { exact: true })).toHaveValue('多ZIP甲-已核对')
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/multi-zip-expanded.png',
    fullPage: true
  })
  await save(page, 3)
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/multi-zip-results.png',
    fullPage: true
  })
  await page.locator('[data-action="import-cards"]').click()
  await expect(page.getByRole('row')).toHaveCount(4)
  await expect(page.locator('tbody')).toContainText('草稿')
  expect(errors).toEqual([])
})

test('one ZIP containing three folders retains all three independent cards', async ({ page }) => {
  await begin(page)
  await page
    .locator('input[type="file"][accept=".zip"]')
    .first()
    .setInputFiles(join(root, 'three-folders.zip'))
  await page.locator('[data-action="start-upload"]').click()
  await review(page)
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(3)
  await expect(page.locator('.import-summary')).toContainText('ZIP 1 个')
  await expect(page.locator('.import-summary')).toContainText('资料完整 3 张')
  await save(page, 3)
})

test('bad ZIP and bad folder do not block readable cards; incomplete audio saves only a draft', async ({
  page
}) => {
  await begin(page)
  await page
    .locator('input[type="file"][accept=".zip"]')
    .first()
    .setInputFiles(['mixed.zip', 'broken.zip'].map((name) => join(root, name)))
  await page.locator('[data-action="start-upload"]').click()
  await review(page)
  await expect(page.locator('.import-summary')).toContainText('ZIP失败 1 个')
  await expect(page.locator('.import-summary')).toContainText('卡片失败 1 张')
  await expect(page.locator('.import-summary')).toContainText('待补充 1 张')
  await save(page, 2)
  await expect(page.locator('.result-summary')).toContainText('无法读取 1')
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/multi-zip-partial.png',
    fullPage: true
  })
  const batchId = new URL(page.url()).searchParams.get('batch')
  const batch = await (await page.request.get(`/api/admin/v1/imports/${batchId}`)).json()
  const missing = batch.items.find(
    (item: { content: { name: string } }) => item.content.name === '缺音频可存草稿'
  )
  const session = await (await page.request.get('/api/admin/v1/auth/session')).json()
  const preview = await page.request.post(`/api/admin/v1/cards/${missing.saved_card_id}/preview`, {
    headers: { 'X-CSRF-Token': session.csrf_token, 'Idempotency-Key': crypto.randomUUID() },
    data: { revision: missing.saved_draft_revision }
  })
  expect(preview.status()).toBe(422)
  const result = await preview.json()
  expect(result.error.details.some((issue: { field: string }) => issue.field === 'audio_id')).toBe(
    true
  )
  const draft = await (
    await page.request.get(`/api/admin/v1/cards/${missing.saved_card_id}`)
  ).json()
  expect(draft.status).toBe('draft')
  expect(draft.current_version_id).toBeNull()
})
