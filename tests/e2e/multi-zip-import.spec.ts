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

/** 将独立验收ZIP加入当前批次并启动传输
 * @param page 当前导入页面
 * @param names 本轮验收资料的ZIP文件名
 */
const uploadSources = async (page: Page, names: string[]) => {
  await page
    .locator('input[type="file"][accept=".zip"]')
    .first()
    .setInputFiles(names.map((name) => join(root, name)))
  await page.locator('[data-action="start-upload"]').click()
}

test('deleted-card reimport saves a new draft and a later duplicate can be removed', async ({
  page
}) => {
  await begin(page)
  await uploadSources(page, ['reimport.zip'])
  await review(page)
  await save(page, 1)
  const firstBatchId = new URL(page.url()).searchParams.get('batch')
  const first = await (await page.request.get(`/api/admin/v1/imports/${firstBatchId}`)).json()
  const old = first.items[0]
  const session = await (await page.request.get('/api/admin/v1/auth/session')).json()
  const deleted = await page.request.delete(`/api/admin/v1/cards/${old.saved_card_id}`, {
    headers: { 'X-CSRF-Token': session.csrf_token, 'Idempotency-Key': crypto.randomUUID() },
    data: { revision: old.saved_draft_revision }
  })
  expect(deleted.status()).toBe(200)
  await page.getByRole('button', { name: '开始新的导入', exact: true }).click()
  await uploadSources(page, ['reimport.zip'])
  await review(page)
  await expect(page.locator('.review-list')).not.toContainText('重复，默认跳过')
  await save(page, 1)
  const secondBatchId = new URL(page.url()).searchParams.get('batch')
  const second = await (await page.request.get(`/api/admin/v1/imports/${secondBatchId}`)).json()
  expect(second.items[0].saved_card_id).not.toBe(old.saved_card_id)
  expect((await page.request.get(`/api/admin/v1/cards/${old.saved_card_id}`)).status()).toBe(410)
  await page.getByRole('button', { name: '开始新的导入', exact: true }).click()
  await uploadSources(page, ['reimport.zip'])
  await review(page)
  await expect(page.locator('.review-list')).toContainText('重复，默认跳过')
  await page.screenshot({
    path: 'test-results/import-duplicate-removal.png',
    fullPage: true,
    animations: 'disabled'
  })
  await page.locator('[data-action="remove-import-item"]').click()
  await expect(page.getByRole('dialog')).toContainText('删除后重传验收')
  await page.locator('[data-action="confirm-import-removal"]').click()
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.import-summary')).toContainText('识别卡片 0 张')
})

test('an accepted ZIP can be removed during a sibling upload and bulk removal preserves the remaining ZIP', async ({
  page
}) => {
  await begin(page)
  let release: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let uploads = 0
  await page.route(/\/imports\/[^/]+\/files\?kind=zip$/, async (route) => {
    uploads++
    if (uploads === 2) await held
    await route.continue()
  })
  await uploadSources(page, [
    'remove-one.zip',
    'remove-two.zip',
    'remove-three.zip',
    'remove-keep.zip'
  ])
  const first = page.locator('.file-list li').filter({ hasText: 'remove-one.zip' })
  await first.locator('[data-action="remove-accepted-upload"]').click()
  await page.locator('[data-action="confirm-import-removal"]').click()
  await expect(first).toHaveCount(0)
  release?.()
  await expect(page.getByRole('button', { name: '进入核对', exact: true })).toBeEnabled({
    timeout: 25000
  })
  await page.getByLabel('移除ZIP remove-two.zip', { exact: true }).check()
  await page.getByLabel('移除ZIP remove-three.zip', { exact: true }).check()
  await page.locator('[data-action="remove-selected-files"]').click()
  await expect(page.getByRole('dialog')).toContainText('2 个ZIP')
  await page.screenshot({
    path: 'test-results/import-zip-removal-confirmation.png',
    fullPage: true,
    animations: 'disabled'
  })
  await page.locator('[data-action="confirm-import-removal"]').click()
  await expect(page.locator('.file-list li')).toHaveCount(1)
  await review(page)
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(1)
  await expect(page.locator('.review-list')).toContainText('保留ZIP验收')
  await save(page, 1)
})

test('single and bulk card removal keep the other folders and their ZIP source', async ({
  page
}) => {
  await begin(page)
  await uploadSources(page, ['removal-folders.zip'])
  await review(page)
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(4)
  await page
    .locator('.review-list tr[data-item-id]')
    .filter({ hasText: '文件夹移除0' })
    .locator('[data-action="remove-import-item"]')
    .click()
  await page.locator('[data-action="confirm-import-removal"]').click()
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(3)
  await page.locator('[data-action="manage-removals"]').click()
  await page.getByLabel('移除 文件夹移除1', { exact: true }).check()
  await page.getByLabel('移除 文件夹移除2', { exact: true }).check()
  await page.locator('[data-action="remove-selected-items"]').click()
  await page.locator('[data-action="confirm-import-removal"]').click()
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.review-list tr[data-item-id]')).toHaveCount(1)
  await expect(page.locator('.import-summary')).toContainText('ZIP 1 个')
  await expect(page.locator('.review-list')).toContainText('文件夹移除3')
  await save(page, 1)
})
