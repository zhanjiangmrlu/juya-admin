import { expect, test } from '@playwright/test'

import type { ImportBatch, ImportItem } from '../../src/shared/types/import'

/** 构造服务端已暂存的卡片，浏览器仍使用真实路由和页面组件
 * @param id 本次导入内的卡片引用
 * @param state 服务端逐卡状态
 * @returns 完整逐卡响应
 */
const item = (id: string, state = 'incomplete'): ImportItem => ({
  id,
  revision: 1,
  selected: true,
  readable: true,
  state,
  content: {
    name: id,
    title_en: 'Saved Review',
    image_id: null,
    audio_id: null,
    dialogue: [],
    vocabulary: [],
    chunks: []
  },
  thumbnail_id: null,
  issues: [{ field: 'image', code: 'missing', message: '缺少场景图，请补充后发布' }],
  source_file_id: 'source',
  source_zip_id: 'source',
  source_zip_name: '晨间.zip',
  source_folder: id,
  target_card_id: null,
  target_revision: null,
  saved_card_id: state === 'saved' ? `card-${id}` : null,
  saved_draft_revision: state === 'saved' ? 1 : null,
  suggested_target_id: null,
  job_id: null,
  error_code: null
})
/** 提供真实恢复契约形状的合成响应
 * @param id 管理员选择的批次
 * @param stage 服务端推导的阶段
 * @returns 可恢复批次
 */
const batch = (id: string, stage: ImportBatch['stage'] = 'review'): ImportBatch => ({
  id,
  mode: 'zip',
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-22T01:20:00Z',
  resumable: true,
  stage,
  source_names: [`${id}.zip`],
  files: [
    {
      id: 'source',
      name: `${id}.zip`,
      kind: 'zip',
      state: 'ready',
      size: 100,
      media_id: null,
      job_id: null,
      error_code: null,
      parent_id: ''
    }
  ],
  items: stage === 'upload' || stage === 'processing' ? [] : [item(`卡片-${id}`)],
  unused_file_ids: []
})

for (const count of [0, 1, 7]) {
  test(`routed A04 displays ${count} recoverable batches with explicit selection`, async ({
    page
  }) => {
    const values = Array.from({ length: count }, (_, index) =>
      batch(`晨间资料-${index + 1}`, index === 1 ? 'upload' : index === 2 ? 'processing' : 'review')
    )
    let checked = ''
    await page.route('**/api/admin/v1/**', async (route) => {
      const url = new URL(route.request().url())
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
      if (url.pathname === '/api/admin/v1/imports') {
        expect(url.searchParams.get('resumable_only')).toBe('true')
        return route.fulfill({ json: values })
      }
      const selected = values.find(
        (value) =>
          url.pathname === `/api/admin/v1/imports/${value.id}` ||
          decodeURIComponent(url.pathname) === `/api/admin/v1/imports/${value.id}`
      )
      if (selected) {
        if (url.searchParams.get('require_resumable') === 'true') checked = selected.id
        return route.fulfill({ json: selected })
      }
      return route.fulfill({
        status: 404,
        json: { error: { code: 'not_found', message: '合成测试不支持此请求' } }
      })
    })
    await page.goto('/imports')
    await expect(page.getByRole('heading', { name: '上传资料', exact: true })).toBeVisible()
    await expect(page.getByText('其他最近导入')).toHaveCount(0)
    await expect(page.locator('[data-resume-batch]')).toHaveCount(count)
    await expect(page).toHaveURL(/\/imports$/)
    await page.screenshot({
      path: `test-results/revision15-import-resume-${count}.png`,
      fullPage: true,
      animations: 'disabled'
    })
    if (count) {
      const chosen = values[count - 1]!
      await expect(page.locator('[data-resume-batch]').last()).toContainText(`${chosen.id}.zip`)
      await expect(page.locator('[data-resume-batch]').last()).toContainText('2026-10-22 09:20')
      await page
        .locator('[data-resume-batch]')
        .last()
        .getByRole('button', { name: '继续处理', exact: true })
        .click()
      await expect(page).toHaveURL(new RegExp(`batch=${encodeURIComponent(chosen.id)}`))
      expect(checked).toBe(chosen.id)
      await expect(page.locator('.import-steps .active')).toContainText('核对卡片')
      await expect(page.locator('.review-list')).toContainText(`卡片-${chosen.id}`)
    } else await expect(page.getByRole('button', { name: '继续处理', exact: true })).toHaveCount(0)
  })
}

test('routed A04 distinguishes query failures and refreshes an invalid selection', async ({
  page
}) => {
  let queryFailed = true
  let stale = true
  await page.route('**/api/admin/v1/**', async (route) => {
    const url = new URL(route.request().url())
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
    if (url.pathname === '/api/admin/v1/imports') {
      if (queryFailed)
        return route.fulfill({
          status: 503,
          json: { error: { code: 'temporarily_unavailable', message: '服务暂不可用' } }
        })
      return route.fulfill({ json: [batch(stale ? 'stale' : 'available')] })
    }
    if (url.pathname.endsWith('/imports/stale')) {
      stale = false
      return route.fulfill({
        status: 409,
        json: { error: { code: 'import_not_resumable', message: '批次不可恢复' } }
      })
    }
    return route.fulfill({ json: batch('available') })
  })
  await page.goto('/imports')
  await expect(page.getByRole('alert')).toContainText('查询失败')
  await expect(page.getByLabel('选择多个ZIP')).toBeAttached()
  queryFailed = false
  await page.locator('[data-action="refresh-resumable"]').click()
  await expect(page.locator('[data-resume-batch="stale"]')).toBeVisible()
  await page.locator('[data-action="resume-import"]').click()
  await expect(page.getByRole('status')).toContainText('不可恢复')
  await expect(page.locator('[data-resume-batch="stale"]')).toHaveCount(0)
  await expect(page.locator('[data-resume-batch="available"]')).toBeVisible()
  await expect(page).toHaveURL(/\/imports$/)
})

test('routed mixed result preserves successful destinations and retries only readable selected failures', async ({
  page
}) => {
  const current = {
    ...batch('mixed', 'result'),
    items: [
      item('已成功', 'saved'),
      item('待重试', 'failed'),
      { ...item('不可读', 'failed'), readable: false },
      { ...item('已排除', 'failed'), selected: false }
    ]
  }
  let savedIds: string[] = []
  await page.route('**/api/admin/v1/**', async (route) => {
    const url = new URL(route.request().url())
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
    if (url.pathname === '/api/admin/v1/imports') return route.fulfill({ json: [current] })
    if (url.pathname.endsWith('/confirmation')) {
      expect(url.searchParams.getAll('item_ids')).toEqual(['待重试'])
      return route.fulfill({
        json: {
          version: 'a'.repeat(64),
          count: 1,
          incomplete: 1,
          saved: 1,
          duplicates: 0,
          excluded: 1,
          unreadable: 1
        }
      })
    }
    if (url.pathname.endsWith('/save')) savedIds = route.request().postDataJSON().item_ids
    return route.fulfill({ json: current })
  })
  await page.goto('/imports')
  await page.locator('[data-action="resume-import"]').click()
  await expect(page.getByRole('heading', { name: '保存结果', exact: true })).toBeVisible()
  await expect(page.locator('[data-action="import-cards"]')).toHaveAttribute(
    'href',
    '/cards?batch_id=mixed'
  )
  await expect(page.getByRole('link', { name: '补充资料' })).toHaveAttribute(
    'href',
    /\/cards\/card-/
  )
  await page.screenshot({
    path: 'test-results/revision15-import-result.png',
    fullPage: true,
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '重试失败项，重新确认', exact: true }).click()
  await expect(page.locator('.save-step li')).toHaveCount(1)
  await expect(page.locator('.save-step li')).toContainText('待重试')
  await page.locator('[data-action="save-import"]').click()
  await expect.poll(() => savedIds).toEqual(['待重试'])
})
