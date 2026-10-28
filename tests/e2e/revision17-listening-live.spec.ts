import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const statePath = process.env.JUYA_REVISION17_STATE || ''
const fixturePath = process.env.JUYA_REVISION17_FIXTURE || ''
test.skip(
  !statePath || !fixturePath,
  'Requires the explicitly supplied local revision17 administrator fixture'
)
test.use({ storageState: statePath || undefined })

test('category, topic and both order surfaces use independent pages and global order previews its free list', async ({
  page
}, info) => {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  await page.goto('/listening/categories')
  await expect(page.getByRole('heading', { name: '分类管理', exact: true })).toBeVisible()
  await page.locator('tbody tr').first().getByRole('button', { name: '编辑', exact: true }).click()
  await expect(page.getByRole('heading', { name: '编辑分类', exact: true })).toBeVisible()
  await expect(page.getByLabel('中文名称', { exact: true })).toBeVisible()
  await page.screenshot({
    path: info.outputPath('categories-1440.png'),
    animations: 'disabled',
    fullPage: true
  })
  await page.getByRole('link', { name: '主题管理', exact: true }).click()
  await expect(page.getByRole('heading', { name: '主题管理', exact: true })).toBeVisible()
  await page
    .locator('tbody tr')
    .first()
    .getByRole('button', { name: '编辑主题', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '编辑主题', exact: true })).toBeVisible()
  await page.screenshot({
    path: info.outputPath('topics-1440.png'),
    animations: 'disabled',
    fullPage: true
  })
  await page.goto(`/listening/topic-order?topic_id=${fixture.topic_id}`)
  await expect(page.getByRole('button', { name: '保存顺序', exact: true })).toBeVisible()
  await page.screenshot({
    path: info.outputPath('topic-order-1440.png'),
    animations: 'disabled',
    fullPage: true
  })
  await page.goto('/listening/global-order')
  await page.getByRole('button', { name: '核对名单并保存', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '核对全局顺序与免费名单' })).toBeVisible()
  await page
    .getByRole('dialog', { name: '核对全局顺序与免费名单' })
    .getByRole('button', { name: '取消', exact: true })
    .click()
  await expect(page.getByRole('dialog', { name: '核对全局顺序与免费名单' })).not.toBeVisible()
  await page.screenshot({
    path: info.outputPath('global-order-1440.png'),
    animations: 'disabled',
    fullPage: true
  })
})

test('local ZIP stages duplicates and unreadable entries, persists removal and explicitly saves only the confirmed draft', async ({
  page,
  baseURL
}, info) => {
  const zipPath = process.env.JUYA_REVISION17_ZIP || ''
  test.skip(!zipPath, 'Requires generated local ZIP fixture')
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname)
  await page.goto('/listening-imports')
  await expect(page.locator('input[type="file"]')).toBeEnabled()
  await page.locator('input[type="file"]').setInputFiles(zipPath)
  await expect(page.getByRole('heading', { name: '核对本批文章', exact: true })).toBeVisible()
  await expect(page.locator('.candidate')).toHaveCount(4)
  await expect(page.locator('.candidate').filter({ hasText: '自动跳过' })).toHaveCount(1)
  await page
    .locator('.candidate')
    .filter({ hasText: '本地浏览器导入' })
    .filter({ has: page.getByRole('button', { name: '核对 / 补充资料' }) })
    .getByRole('button', { name: '预览与试听（可选）' })
    .click()
  const stagedPreview = page.getByRole('dialog', { name: '本批候选只读预览' })
  await stagedPreview.locator('audio').evaluate((element) => (element as HTMLAudioElement).play())
  await expect
    .poll(() =>
      stagedPreview
        .locator('audio')
        .evaluate((element) => (element as HTMLAudioElement).currentTime)
    )
    .toBeGreaterThan(0.1)
  await stagedPreview.locator('audio').evaluate((element) => (element as HTMLAudioElement).pause())
  await stagedPreview.getByRole('button', { name: 'Close this dialog' }).click()
  await page.screenshot({
    path: info.outputPath('import-review-1440.png'),
    animations: 'disabled',
    fullPage: true
  })
  await page.getByRole('button', { name: '取消选择', exact: true }).click()
  await page.locator('.candidate').filter({ hasText: '无法读取' }).getByRole('checkbox').check()
  await expect(page.getByRole('button', { name: '核对完成，下一步' })).toBeDisabled()
  await page.getByRole('button', { name: '批量删除导入项（1）' }).click()
  await page.getByRole('button', { name: '确认删除1项' }).click()
  await expect(page.locator('.candidate')).toHaveCount(3)
  await page.reload()
  await expect(page.locator('.candidate')).toHaveCount(3)
  await page
    .locator('.candidate')
    .filter({ hasText: '多素材候选' })
    .getByRole('button', { name: '核对 / 补充资料' })
    .click()
  await page.getByLabel('完整音频对应', { exact: true }).selectOption({ index: 1 })
  await page.getByRole('button', { name: '保存到本批暂存' }).click()
  await expect(page.locator('.candidate-editor')).toHaveCount(0)
  await page.getByRole('button', { name: '取消选择', exact: true }).click()
  await page
    .locator('.candidate')
    .filter({ hasText: '本地浏览器导入' })
    .filter({ has: page.getByRole('button', { name: '核对 / 补充资料' }) })
    .getByRole('checkbox')
    .check()
  await page.getByRole('button', { name: '核对完成，下一步' }).click()
  await expect(page.getByRole('heading', { name: '确认保存草稿范围' })).toBeVisible()
  const batchId = new URL(page.url()).searchParams.get('batch_id')!
  const before = await (
    await page.request.get(`/api/admin/v1/listening/articles?batch_id=${batchId}`)
  ).json()
  expect(before.total).toBe(0)
  await page.getByRole('button', { name: '确认保存草稿', exact: true }).click()
  await expect(page.getByRole('heading', { name: '本次保存结果' })).toBeVisible()
  const after = await (
    await page.request.get(`/api/admin/v1/listening/articles?batch_id=${batchId}`)
  ).json()
  expect(after.total).toBe(1)
  expect(after.items[0].status).toBe('draft')
  await page.screenshot({
    path: info.outputPath('import-results-1440.png'),
    animations: 'disabled',
    fullPage: true
  })
})

test('single DOCX shows changes before applying, cancellation preserves input and parsing creates no batch', async ({
  page
}) => {
  const docxPath = process.env.JUYA_REVISION17_DOCX || ''
  test.skip(!docxPath, 'Requires the generated local single DOCX fixture')
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  await page.goto(`/listening/${fixture.article_id}`)
  const title = page.getByLabel('中文标题', { exact: true }),
    file = page.locator('input[accept=".docx"]')
  await expect(file).toBeEnabled()
  await title.fill('保留尚未保存的输入')
  const before = await (await page.request.get('/api/admin/v1/listening/imports')).json()
  await file.setInputFiles(docxPath)
  const changes = page.getByRole('dialog', { name: '核对DOCX带入变化' })
  await expect(changes.getByRole('heading', { name: '当前输入' })).toBeVisible()
  await changes.getByRole('button', { name: '取消带入' }).click()
  await expect(title).toHaveValue('保留尚未保存的输入')
  await file.setInputFiles(docxPath)
  await changes.getByRole('button', { name: '确认带入以上资料' }).click()
  await expect(title).toHaveValue(/本地浏览器导入/)
  const after = await (await page.request.get('/api/admin/v1/listening/imports')).json()
  expect(after.total).toBe(before.total)
})

test('local real listening management, draft preview, M confirmation and shared user statistics', async ({
  page,
  baseURL
}, info) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname)
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/listening')
  await expect(page.getByRole('heading', { name: '听读文章管理', exact: true })).toBeVisible()
  await expect(page.locator('tbody tr')).not.toHaveCount(0)
  await page.screenshot({ path: info.outputPath('article-management-1440.png'), fullPage: true })
  await page.getByRole('button', { name: '免费开放设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '听读管理设置' })
  await expect(settings.getByText('免费篇数M', { exact: false })).toBeVisible()
  await settings.getByRole('textbox').fill('1')
  await settings.getByRole('button', { name: '预览名单与影响' }).click()
  await expect(settings.getByRole('heading', { name: /将生效的完整名单/ })).toBeVisible()
  await expect(settings.getByRole('button', { name: '确认保存M与名单' })).toBeEnabled()
  await page.screenshot({ path: info.outputPath('free-policy-preview-1440.png'), fullPage: true })
  await settings.getByRole('button', { name: 'Close this dialog' }).click()
  await page.goto(`/listening/${fixture.article_id}`)
  await expect(page.getByLabel('英文正文', { exact: false })).not.toBeEmpty()
  await page.screenshot({ path: info.outputPath('article-edit-1440.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '预览并核对发布' }).click()
  const preview = page.getByRole('dialog', { name: '当前编辑稿预览' })
  await expect(preview.locator('audio')).toHaveCount(1)
  await expect(preview.getByRole('button', { name: '播放完整音频' })).toBeVisible()
  expect(
    await preview.locator('audio').evaluate((element) => (element as HTMLAudioElement).paused)
  ).toBe(true)
  await preview.locator('audio').evaluate((element) => (element as HTMLAudioElement).play())
  await expect
    .poll(() =>
      preview.locator('audio').evaluate((element) => (element as HTMLAudioElement).currentTime)
    )
    .toBeGreaterThan(0.1)
  await preview.locator('audio').evaluate((element) => (element as HTMLAudioElement).pause())
  await preview.getByRole('button', { name: '展开完整音频倍速' }).click()
  await expect(preview.locator('.inline-rates button')).toHaveCount(5)
  await preview.locator('.inline-rates button').nth(2).click()
  expect(
    await preview.locator('audio').evaluate((element) => (element as HTMLAudioElement).playbackRate)
  ).toBe(1.5)
  await expect(preview.getByText('管理员只读预览', { exact: false })).toBeVisible()
  await preview.screenshot({
    path: info.outputPath('article-preview-1440.png'),
    animations: 'disabled'
  })
  await preview.getByRole('button', { name: '返回修改' }).click()
  await page.goto(`/users/${fixture.user_id}`)
  await expect(page.getByText('已学听读', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '已学听读', exact: true }).click()
  await page.screenshot({
    path: info.outputPath('user-listening-records-1440.png'),
    fullPage: true
  })
  await page.goto('/listening-imports')
  await expect(page.getByRole('heading', { name: '听读批量导入' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('import-upload-1440.png'), fullPage: true })
  expect(errors).toEqual([])
})
