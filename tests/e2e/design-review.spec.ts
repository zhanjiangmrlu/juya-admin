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
  await page.screenshot({ animations: 'disabled', path: 'test-results/design-login.png' })
  await page.getByLabel('管理员账号').fill(credentials.username)
  await page.getByLabel('密码', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  await page.goto('/cards?search=晨间')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ animations: 'disabled', path: 'test-results/design-cards.png' })
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
  await page.screenshot({ animations: 'disabled', path: 'test-results/design-preview.png' })
  const audio = page.getByRole('dialog').locator('audio')
  await page.getByRole('button', { name: '播放完整音频', exact: true }).click()
  await expect
    .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).paused))
    .toBe(false)
  await page.getByLabel('完整音频倍速').selectOption('1.5')
  await expect
    .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).playbackRate))
    .toBe(1.5)
  const beforeSeek = await audio.evaluate((element) => (element as HTMLAudioElement).currentTime)
  await page.getByLabel('完整音频播放进度').press('ArrowRight')
  await expect
    .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).currentTime))
    .toBeGreaterThan(beforeSeek)
  await page.getByRole('button', { name: '暂停完整音频', exact: true }).click()
  await expect
    .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).paused))
    .toBe(true)
  await page.getByRole('button', { name: '关闭预览', exact: true }).click()
  await page.goto(`/cards/${seed.cards[0]}`)
  await expect(page.getByLabel('中文标题', { exact: true })).not.toHaveValue('')
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeInViewport()
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/design-editor.png',
    fullPage: true
  })
  await page.screenshot({ animations: 'disabled', path: 'test-results/design-editor-viewport.png' })
  await page.screenshot({ animations: 'disabled', path: 'test-results/design-editor-viewport.png' })
  await page.goto('/imports')
  await expect(page.getByLabel('选择多个ZIP')).toBeAttached()
  await page.screenshot({ animations: 'disabled', path: 'test-results/design-imports.png' })
  await page.goto('/users')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: 'test-results/design-users.png' })
  await page.goto(`/users/${seed.users[1]}`)
  await expect(page.getByRole('heading', { name: '账号资料', exact: true })).toBeVisible()
  await expect(page.locator('.learning-records tbody tr').first()).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/design-user-detail.png',
    fullPage: true
  })
  await page.goto('/statistics')
  await expect(page.locator('.metric-value')).toHaveCount(3)
  await page.screenshot({ animations: 'disabled', path: 'test-results/design-statistics.png' })
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
    await page.screenshot({
      animations: 'disabled',
      path: `test-results/design-responsive-${width}.png`
    })
  }
  expect(errors).toEqual([])
})

test('long import preview has an independent scroll area and reachable close action', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 600 })
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill(credentials.username)
  await page.getByLabel('密码', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  const batches = await (await page.request.get('/api/admin/v1/imports')).json()
  const batch = batches.find(
    (value: { items: { readable: boolean }[] }) =>
      value.items.length > 0 && value.items.every((item) => item.readable)
  )
  expect(batch).toBeTruthy()
  await page.goto(`/imports?batch=${batch.id}`)
  await expect(page.locator('.import-summary')).toBeVisible()
  const back = page.getByRole('button', { name: '返回核对', exact: true })
  if (await back.isVisible()) await back.click()
  await page.getByRole('button', { name: '展开核对', exact: true }).first().click()
  await page.getByRole('button', { name: '预览核对', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导入核对预览 · 尚未保存为卡片草稿' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.preview-scroll')).toBeVisible()
  expect(
    await dialog
      .locator('.preview-scroll')
      .evaluate((element) => element.scrollHeight > element.clientHeight)
  ).toBe(true)
  await expect(dialog.getByRole('button', { name: '返回核对', exact: true })).toBeInViewport()
  await page.screenshot({ animations: 'disabled', path: 'test-results/design-import-preview.png' })
  await dialog.getByRole('button', { name: '返回核对', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test('publication error keeps retry and return actions inside a short preview dialog', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 600 })
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill(credentials.username)
  await page.getByLabel('密码', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  await page.goto(`/cards/${seed.cards[0]}`)
  await expect(page.getByLabel('中文标题', { exact: true })).not.toHaveValue('')
  await page.getByRole('button', { name: '预览并发布', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '发布前预览', exact: true })
  await expect(dialog).toBeVisible()
  await page.route('**/api/admin/v1/cards/*/publish', (route) =>
    route.fulfill({
      status: 422,
      json: {
        error: {
          code: 'design_validation_failure',
          message: '发布未成功，请保留当前候选并重新核对资料后重试。'
        }
      }
    })
  )
  await dialog.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('发布未成功')
  const footer = dialog.locator('[class~="el-dialog__footer"]')
  expect(
    await footer.evaluate(
      (element) =>
        element.getBoundingClientRect().bottom <=
        element.closest('[role="dialog"]')!.getBoundingClientRect().bottom
    )
  ).toBe(true)
  await expect(dialog.getByRole('button', { name: '返回修改', exact: true })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: '确认发布', exact: true })).toBeInViewport()
  await page.screenshot({ animations: 'disabled', path: 'test-results/design-publish-error.png' })
  await dialog.getByRole('button', { name: '返回修改', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test('editor dialogue, vocabulary and chunks keep the compact design layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  await page.goto('/login')
  await page.getByLabel('管理员账号').fill(credentials.username)
  await page.getByLabel('密码', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page.getByRole('heading', { name: '卡片管理', exact: true })).toBeVisible()
  await page.goto(`/cards/${seed.cards[0]}`)
  await expect(page.getByLabel('中文标题', { exact: true })).not.toHaveValue('')
  const word = page.locator('.vocabulary-entry').first()
  const fields = await Promise.all(
    ['英文词汇', '本句中文释义（选填）', '音标（选填）'].map((name) =>
      word.getByLabel(name, { exact: true }).boundingBox()
    )
  )
  expect(
    Math.max(...fields.map((box) => box!.y)) - Math.min(...fields.map((box) => box!.y))
  ).toBeLessThan(2)
  expect((await word.boundingBox())!.height).toBeLessThan(330)
  expect((await page.locator('.chunk-entry').first().boundingBox())!.height).toBeLessThan(125)
  const dialogue = page.locator('.dialogue-entry').first()
  expect(await dialogue.evaluate((element) => getComputedStyle(element).marginTop)).toBe('0px')
  expect(await dialogue.evaluate((element) => getComputedStyle(element).borderLeftWidth)).toBe(
    '0px'
  )
  await word.scrollIntoViewIfNeeded()
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/design-compact-vocabulary.png'
  })
  await page.locator('.chunk-entry').first().scrollIntoViewIfNeeded()
  await page.screenshot({ animations: 'disabled', path: 'test-results/design-compact-chunks.png' })
})
