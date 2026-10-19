import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type { Page } from '@playwright/test'

const root = process.env.JUYA_IMPORT_VERIFY_DIR || ''
const credentials = root ? JSON.parse(readFileSync(`${root}/credentials.json`, 'utf8')) : {}
test.skip(!root, 'Requires an isolated admin verification API and media directory')

/** 对隔离后台执行真实登录
 * @param page 当前验收浏览器页面
 */
const login = async (page: Page) => {
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill(credentials.username)
  await page.getByLabel('密码', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
}

test('remembers list position and selection after returning from the editor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 })
  await login(page)
  const session = await (await page.request.get('/api/admin/v1/auth/session')).json()
  const prefix = `返回位置验收${Date.now()}`
  for (let index = 0; index < 11; index++) {
    const response = await page.request.post('/api/admin/v1/cards', {
      headers: { 'X-CSRF-Token': session.csrf_token, 'Idempotency-Key': crypto.randomUUID() },
      data: { content: { name: `${prefix}-${index}` } }
    })
    expect(response.ok()).toBe(true)
  }
  await page.goto(`/cards?status=draft&search=${prefix}&page=1`)
  await expect(page.locator('tbody tr')).toHaveCount(10)
  const row = page.locator('tbody tr').last()
  await row.locator('input[type=checkbox]').check()
  const link = row.getByRole('link', { name: '编辑', exact: true })
  await link.scrollIntoViewIfNeeded()
  const position = await page.evaluate(() => window.scrollY)
  const address = page.url()
  expect(position).toBeGreaterThan(100)
  await link.click()
  await page.getByRole('link', { name: '返回列表' }).click()
  await expect(page).toHaveURL(address)
  await expect(row.locator('input[type=checkbox]')).toBeChecked()
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - position))
    .toBeLessThan(2)
})

test('server pagination, scoped batch operations, versioned image and global order work together', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await login(page)
  const session = await (await page.request.get('/api/admin/v1/auth/session')).json()
  const headers = () => ({
    'X-CSRF-Token': session.csrf_token,
    'Idempotency-Key': crypto.randomUUID()
  })
  const image = await (
    await page.request.post('/api/admin/v1/media?kind=image', {
      headers: headers(),
      multipart: {
        file: {
          name: '管理验收场景.png',
          mimeType: 'image/png',
          buffer: readFileSync(`${root}/scene.png`)
        }
      }
    })
  ).json()
  const audio = await (
    await page.request.post('/api/admin/v1/media?kind=audio', {
      headers: headers(),
      multipart: {
        file: {
          name: '管理验收完整音频.wav',
          mimeType: 'audio/wav',
          buffer: readFileSync(`${root}/dialogue.wav`)
        }
      }
    })
  ).json()
  for (const id of [image.id, audio.id])
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/admin/v1/media/${id}/status`)).json()).state
      )
      .toBe('ready')
  const prefix = `管理验收${Date.now()}卡`
  const cards = []
  for (let number = 1; number <= 23; number++) {
    const card = await (
      await page.request.post('/api/admin/v1/cards', {
        headers: headers(),
        data: {
          content: {
            name: `${prefix}${String(number).padStart(2, '0')}`,
            title_en: 'Ordering Coffee',
            image_id: image.id,
            audio_id: audio.id,
            dialogue: [
              { id: 'line', speaker: 'A', english: 'Hello coffee.', chinese: '你好，咖啡。' }
            ],
            vocabulary: [{ id: 'word', english: 'coffee', meaning: '咖啡' }],
            chunks: []
          }
        }
      })
    ).json()
    if (number !== 22) {
      const preview = await (
        await page.request.post(`/api/admin/v1/cards/${card.id}/preview`, {
          headers: headers(),
          data: { revision: card.draft_revision }
        })
      ).json()
      const published = await page.request.post(`/api/admin/v1/cards/${card.id}/publish`, {
        headers: headers(),
        data: { revision: card.draft_revision, preview_id: preview.preview_id }
      })
      expect(published.ok()).toBe(true)
      Object.assign(card, await published.json())
    }
    if (number === 23)
      Object.assign(
        card,
        await (
          await page.request.post(`/api/admin/v1/cards/${card.id}/offline`, {
            headers: headers(),
            data: { revision: card.draft_revision }
          })
        ).json()
      )
    cards.push(card)
  }
  await page.goto(`/cards?search=${encodeURIComponent(prefix)}`)
  await expect(page.locator('tbody tr')).toHaveCount(10)
  await expect(page.locator('.pagination')).toContainText('共 23 张')
  await page.getByLabel('选择本页卡片').check()
  await expect(page.locator('.selection-bar')).toContainText('已选择 10 张')
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.locator('.selection-bar')).toContainText('已选择 0 张')
  await expect(page.locator('.pagination')).toContainText('第 2 / 3 页')
  const row = page.locator('tbody tr').filter({ hasText: '已发布' }).first()
  await row.locator('input[type=checkbox]').check()
  const before = page.url()
  await row.locator('.thumbnail-button').click()
  await expect(page.getByRole('dialog')).toContainText('场景大图')
  await page.getByRole('button', { name: '放大场景图' }).click()
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/admin-image-preview.png',
    fullPage: true
  })
  await page.getByRole('button', { name: '关闭大图' }).click()
  expect(page.url()).toBe(before)
  await expect(row.locator('input[type=checkbox]')).toBeChecked()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('学习记录及打卡保留')
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(row.locator('input[type=checkbox]')).toBeChecked()
  await page.getByRole('button', { name: '批量下线', exact: true }).click()
  const confirm = page.getByRole('button', { name: /^确认下线[1-9]/ })
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.getByRole('dialog')).toContainText('成功 1 张')
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/admin-action-result.png',
    fullPage: true
  })
  await page.getByRole('button', { name: '关闭结果' }).click()
  await expect(page.locator('.pagination')).toContainText('共 23 张')
  await page.goto('/cards?status=published')
  await page.getByRole('button', { name: '调整顺序', exact: true }).click()
  await expect(page.locator('.catalog-name')).toHaveCount(10)
  const firstName = await page.locator('.catalog-name .chinese').first().innerText()
  const order = await (await page.request.get('/api/admin/v1/catalog-order')).json()
  await page.locator('details').first().getByText('指定位置').click()
  await page
    .getByLabel(`${firstName} 移动到全局位置`, { exact: true })
    .fill(String(order.items.length))
  await page.locator('[data-move]').first().click()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/admin-global-order.png',
    fullPage: true
  })
  await page.getByRole('button', { name: '保存顺序', exact: true }).click()
  await expect(page.locator('.catalog-order')).toHaveCount(0)
  const saved = await (await page.request.get('/api/admin/v1/catalog-order')).json()
  expect(saved.items.map((item: { id: string }) => item.id)).toEqual([
    ...order.items.slice(1).map((item: { id: string }) => item.id),
    order.items[0].id
  ])
  expect(errors).toEqual([])
})
