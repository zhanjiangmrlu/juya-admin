import { expect, test } from '@playwright/test'

import type { ImportBatch } from '../../src/shared/types/import'

/** 构造独立浏览器验收使用的未完成批次
 * @param id 合成批次标识
 * @returns 含精确更新时间和来源名的契约快照
 */
const batch = (id: string): ImportBatch => ({
  id,
  mode: 'zip',
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-23T01:02:03.123456Z',
  resumable: true,
  stage: 'upload',
  source_names: [`${id}.zip`],
  files: [],
  items: [],
  unused_file_ids: []
})

for (const count of [1, 3]) {
  test(`A04 confirms deletion of one candidate among ${count} and recovers a lost receipt`, async ({
    page
  }) => {
    const values = Array.from({ length: count }, (_, index) => batch(`pending-${index}`))
    let deleted = false,
      key = '',
      deleteCount = 0
    await page.route('**/api/admin/v1/**', async (route) => {
      const request = route.request(),
        url = new URL(request.url())
      if (url.pathname.endsWith('/auth/session'))
        return route.fulfill({
          json: { id: 'admin', username: 'admin', csrf_token: 'synthetic-csrf' }
        })
      if (url.pathname.endsWith('/unread'))
        return route.fulfill({ json: { unread: false, count: 0 } })
      if (url.pathname.endsWith('/configuration'))
        return route.fulfill({
          json: {
            archive_limit_bytes: 10000000,
            image_limit_bytes: 1000000,
            audio_limit_bytes: 1000000,
            import_card_limit: 100
          }
        })
      if (url.pathname === '/api/admin/v1/imports')
        return route.fulfill({
          json: values.filter((value) => !deleted || value.id !== 'pending-0')
        })
      if (request.method() === 'DELETE' && url.pathname === '/api/admin/v1/imports/pending-0') {
        expect(request.postDataJSON()).toEqual({
          expected_updated_at: '2026-10-23T01:02:03.123456Z'
        })
        expect(request.headers()['x-csrf-token']).toBe('synthetic-csrf')
        key = request.headers()['idempotency-key']!
        expect(key).toBeTruthy()
        deleteCount++
        deleted = true
        return route.abort('connectionreset')
      }
      if (url.pathname === `/api/admin/v1/operations/${key}`)
        return route.fulfill({ json: { key, result: { id: 'pending-0', deleted: true } } })
      throw new Error(`Unexpected request ${request.method()} ${url.pathname}`)
    })
    await page.goto('/imports')
    const row = page.locator('[data-resume-batch="pending-0"]')
    await row.getByRole('button', { name: '删除批次', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '删除未完成导入批次？' })
    await expect(dialog).toContainText('pending-0.zip')
    await expect(dialog).toContainText('已保存的卡片、素材和用户成绩会保留')
    expect(deleteCount).toBe(0)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await row.getByRole('button', { name: '删除批次', exact: true }).click()
    await dialog.getByRole('button', { name: '确认删除批次', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('网络连接中断')
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await page.screenshot({ path: `test-results/v15-delete-${count}-unknown.png`, fullPage: true })
    await dialog.getByRole('button', { name: '查询／重试删除', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('[data-action="delete-import-batch"]')).toHaveCount(count - 1)
    await expect(row).toHaveCount(0)
    await expect(page).toHaveURL(/\/imports$/)
    expect(deleteCount).toBe(1)
  })
}

test('A04 refreshes a 409 conflict and requires a new version confirmation', async ({ page }) => {
  let version = '2026-10-23T01:02:03.123456Z',
    attempts = 0
  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    if (url.pathname.endsWith('/auth/session'))
      return route.fulfill({ json: { id: 'admin', username: 'admin', csrf_token: 'synthetic' } })
    if (url.pathname.endsWith('/unread'))
      return route.fulfill({ json: { unread: false, count: 0 } })
    if (url.pathname.endsWith('/configuration'))
      return route.fulfill({
        json: {
          archive_limit_bytes: 10000000,
          image_limit_bytes: 1000000,
          audio_limit_bytes: 1000000,
          import_card_limit: 100
        }
      })
    if (url.pathname === '/api/admin/v1/imports')
      return route.fulfill({ json: [{ ...batch('conflict'), updated_at: version }] })
    if (request.method() === 'DELETE') {
      attempts++
      if (attempts === 1) {
        version = '2026-10-23T02:00:00.654321Z'
        return route.fulfill({
          status: 409,
          json: { error: { code: 'import_changed', message: '批次资料已变化' } }
        })
      }
      expect(request.postDataJSON()).toEqual({ expected_updated_at: '2026-10-23T02:00:00.654321Z' })
      return route.fulfill({ json: { id: 'conflict', deleted: true } })
    }
    throw new Error(`Unexpected request ${request.method()} ${url.pathname}`)
  })
  await page.goto('/imports')
  await page.locator('[data-action="delete-import-batch"]').click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('[data-action="confirm-batch-deletion"]').click()
  await expect(dialog.getByRole('alert')).toContainText('批次资料已变化')
  await expect(dialog.locator('[data-action="confirm-batch-deletion"]')).toHaveCount(0)
  await dialog.locator('[data-action="refresh-batch-deletion"]').click()
  await expect(dialog).toHaveCount(0)
  expect(attempts).toBe(1)
  await page.locator('[data-action="delete-import-batch"]').click()
  await dialog.locator('[data-action="confirm-batch-deletion"]').click()
  await expect(page.locator('[data-resume-batch]')).toHaveCount(0)
  expect(attempts).toBe(2)
})

test('A03 republishes unchanged offline content and displays Worker outcomes before refreshing', async ({
  page
}) => {
  let accepted = false,
    state = 'queued',
    attempts = 0
  const content = {
    name: '看看浴室设施',
    title_en: 'A Bathroom Walk-Through',
    image_id: null,
    audio_id: null,
    dialogue: [],
    vocabulary: [],
    chunks: []
  }
  /** 根据合成 Worker 结果生成后台的真实卡片状态
   * @returns 当前是否已上架的卡片快照
   */
  const card = () => ({
    id: 'offline-card',
    display_name: content.name,
    display_title_en: content.title_en,
    display_thumbnail_id: null,
    display_image_id: null,
    status: state === 'succeeded' ? 'published' : 'offline',
    draft_revision: 3,
    current_version_id: 'existing-version',
    has_unpublished_changes: false,
    content,
    issues: [],
    updated_at: '2026-10-23T11:00:00Z'
  })
  /** 返回持久化逐卡发布结果
   * @returns 服务端已落盘的结果契约
   */
  const result = () => ({
    id: 'publication',
    created_at: '2026-10-23T12:00:00Z',
    items: [
      {
        id: 'item',
        card_id: 'offline-card',
        name: content.name,
        title_en: content.title_en,
        state,
        job_id: 'worker',
        error_code: state === 'failed' ? 'publish_failed' : null
      }
    ]
  })
  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    if (url.pathname.endsWith('/auth/session'))
      return route.fulfill({ json: { id: 'admin', username: 'admin', csrf_token: 'synthetic' } })
    if (url.pathname.endsWith('/unread'))
      return route.fulfill({ json: { unread: false, count: 0 } })
    if (url.pathname === '/api/admin/v1/cards')
      return route.fulfill({
        json: { items: [card()], total: 1, page: 1, limit: 10, total_pages: 1 }
      })
    if (url.pathname === '/api/admin/v1/cards/offline-card') return route.fulfill({ json: card() })
    if (url.pathname.endsWith('/preview')) {
      expect(request.postDataJSON()).toEqual({ revision: 3 })
      return route.fulfill({
        json: {
          preview_id: 'preview',
          revision: 3,
          content,
          mode: 'draft',
          expires_at: '2026-10-23T13:00:00Z'
        }
      })
    }
    if (url.pathname === '/api/admin/v1/card-action-batches') return route.fulfill({ json: [] })
    if (url.pathname === '/api/admin/v1/publication-batches' && request.method() === 'POST') {
      attempts++
      expect(request.postDataJSON()).toEqual({
        confirmed: true,
        items: [{ card_id: 'offline-card', revision: 3, preview_id: 'preview' }]
      })
      accepted = true
      return route.fulfill({ json: result() })
    }
    if (url.pathname === '/api/admin/v1/publication-batches')
      return route.fulfill({ json: accepted ? [result()] : [] })
    if (url.pathname.endsWith('/retry')) {
      state = 'queued'
      return route.fulfill({ json: result() })
    }
    if (url.pathname === '/api/admin/v1/publication-batches/publication')
      return route.fulfill({ json: result() })
    throw new Error(`Unexpected request ${request.method()} ${url.pathname}`)
  })
  await page.goto('/cards')
  await expect(page.locator('tbody')).toContainText('已下线')
  await page.getByLabel('选择本页卡片', { exact: true }).check()
  await page.getByRole('button', { name: '批量发布', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('可发布 1 张')
  await expect(dialog.locator('[data-action="publish-reviewed"]')).toBeDisabled()
  await dialog.locator('[data-action="confirm-reviewed"]').check()
  await dialog.locator('[data-action="publish-reviewed"]').click()
  await expect(dialog.locator('.result-totals')).toContainText('成功 0 张')
  await expect(dialog.locator('.result-totals')).toContainText('处理中 1 张')
  state = 'failed'
  await expect(dialog.locator('.result-totals')).toContainText('失败 1 张')
  await expect(page.locator('.table-wrap tbody')).toContainText('已下线')
  await dialog.getByRole('button', { name: '重试失败项', exact: true }).click()
  await expect(dialog.locator('.result-totals')).toContainText('处理中 1 张')
  state = 'succeeded'
  await expect(dialog.locator('.result-totals')).toContainText('成功 1 张')
  await expect(page.locator('.table-wrap tbody')).toContainText('已发布')
  await expect(dialog).toContainText('已学卡保留成绩')
  await page.screenshot({ path: 'test-results/v15-republish-success.png', fullPage: true })
  expect(attempts).toBe(1)
})
