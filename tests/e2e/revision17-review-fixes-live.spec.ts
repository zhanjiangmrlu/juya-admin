import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'
const statePath = process.env.JUYA_REVISION17_STATE || ''
const fixturePath = process.env.JUYA_REVISION17_FIXTURE || ''
test.skip(!statePath || !fixturePath, 'Requires an explicitly supplied local-only fixture')
test.use({ storageState: statePath || undefined })

test('creation commits then loses its response; changed input updates that original article exactly once', async ({
  page,
  baseURL
}, info) => {
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname)
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const marker = `审查恢复${Date.now()}`
  let createdId = '',
    originalKey = ''
  let creates = 0
  await page.route('**/api/admin/v1/listening/articles', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    creates++
    const committed = await route.fetch()
    expect(committed.ok()).toBe(true)
    const article = await committed.json()
    createdId = article.id
    originalKey = route.request().headers()['idempotency-key']!
    await route.abort('failed')
  })
  await page.goto('/listening/new')
  await page.getByRole('combobox', { name: '所属主题', exact: true }).selectOption(fixture.topic_id)
  await page.getByLabel('中文标题', { exact: true }).fill(marker)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('网络连接中断，请重试以确认结果')
  await page.getByLabel('中文标题', { exact: true }).fill(marker + '已修改')
  const recovered = page.waitForResponse(
    (r) => r.url().includes(`/operations/${originalKey}`) && r.status() === 200
  )
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await recovered
  await expect(page).toHaveURL(new RegExp(`/listening/${createdId}$`))
  await expect(page.getByLabel('中文标题', { exact: true })).toHaveValue(marker + '已修改')
  const matches = await (
    await page.request.get(`/api/admin/v1/listening/articles?q=${encodeURIComponent(marker)}`)
  ).json()
  expect(matches.total).toBe(1)
  expect(matches.items[0].id).toBe(createdId)
  expect(creates).toBe(1)
  await page.screenshot({ path: info.outputPath('creation-recovered.png'), animations: 'disabled' })
})

test('real listening list and detail image requests consume safe image tickets without Bearer headers', async ({
  page
}, info) => {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  await page.addInitScript(
    ({ token, owner }) => {
      localStorage.setItem(
        'juya-rebuild-mini-session-v1',
        JSON.stringify({ type: 'object', data: { access_token: token, user_id: owner } })
      )
    },
    { token: fixture.access_token, owner: fixture.user_id }
  )
  const images: { status: number; bearer: boolean }[] = []
  page.on('response', (response) => {
    if (
      response.url().includes('/api/mini/v1/listening/media/') &&
      response.request().resourceType() === 'image'
    )
      images.push({
        status: response.status(),
        bearer: !!response.request().headers()['authorization']
      })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`http://127.0.0.1:5174/#/sub-packages/listening/topic?id=${fixture.topic_id}`)
  const listImage = page.locator('.thumbnail img').first()
  await expect(listImage).toBeVisible()
  await expect
    .poll(() => listImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  await page.screenshot({ path: info.outputPath('topic-image-390.png'), animations: 'disabled' })
  await page.goto(`http://127.0.0.1:5174/#/sub-packages/listening/article?id=${fixture.article_id}`)
  const detailImage = page.locator('.image-entry img').first()
  await expect(detailImage).toBeVisible()
  await expect
    .poll(() => detailImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  expect(images.length).toBeGreaterThanOrEqual(2)
  expect(images.every((image) => image.status === 200 && !image.bearer)).toBe(true)
  await page.screenshot({ path: info.outputPath('article-image-390.png'), animations: 'disabled' })
})
