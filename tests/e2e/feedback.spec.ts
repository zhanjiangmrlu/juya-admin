import { expect, test } from '@playwright/test'

import type { FeedbackDetail } from '../../src/shared/types/feedback'

const feedback: FeedbackDetail = {
  id: 'FB1001',
  user_id: 'U1001',
  user_code: 'Juya001',
  category: 'content',
  status: 'pending',
  summary: '释义需要核对',
  source: 'scene',
  card_id: 'card-one',
  version_id: 'version-one',
  source_title: '晨间活动',
  source_title_en: 'Morning movement',
  source_available: false,
  source_unavailable_reason: 'deleted',
  created_at: '2026-10-21T11:20:00Z',
  updated_at: '2026-10-22T01:10:00Z',
  unread: true,
  latest_event_id: 1,
  events: [
    {
      id: 1,
      actor: 'user',
      text: '请核对这句说明，第一张截图中译文似乎没有完整显示。',
      status: null,
      images: [],
      created_at: '2026-10-21T11:20:00Z'
    }
  ]
}

test('actual routed list preserves query and scroll when returning from a detail', async ({
  page
}) => {
  await page.route('**/api/admin/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = path.endsWith('/auth/session')
      ? { id: 'admin-one', username: 'admin', csrf_token: 'synthetic-token' }
      : path.endsWith('/read')
        ? { feedback_id: feedback.id, read_event_id: 1 }
        : path.endsWith('/unread')
          ? { unread: true, count: 2 }
          : path.endsWith('/feedback')
            ? {
                items: Array.from({ length: 10 }, (_, index) => ({
                  ...feedback,
                  id: `FB${1001 + index}`,
                  events: []
                })),
                total: 30,
                page: 2,
                limit: 10
              }
            : feedback
    await route.fulfill({ json })
  })
  await page.goto('/feedback?status=pending&page=2')
  await expect(page.locator('.el-table tbody tr')).toHaveCount(10)
  const dimensions = await page.locator('.el-table').evaluate((table) => ({
    width: table.getBoundingClientRect().width,
    columns: [...table.querySelectorAll('thead th')].map(
      (cell) => cell.getBoundingClientRect().width
    ),
    rows: [...table.querySelectorAll('tbody tr')].map((row) => row.getBoundingClientRect().height)
  }))
  for (const [index, ratio] of [0.15, 0.12, 0.34, 0.11, 0.17, 0.11].entries())
    expect(Math.abs(dimensions.columns[index]! / dimensions.width - ratio)).toBeLessThan(0.003)
  expect(dimensions.rows.every((height) => Math.abs(height - 93) <= 1)).toBe(true)
  await expect(page.locator('tbody tr').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await page.locator('tbody tr').first().hover()
  await expect(page.locator('tbody tr').first().locator('td').first()).toHaveCSS(
    'background-color',
    'rgb(246, 249, 241)'
  )
  await page.screenshot({ path: 'test-results/revision15-feedback-list.png', fullPage: true })
  await page.evaluate(() => window.scrollTo(0, 300))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300)
  await page.getByRole('link', { name: '查看并处理' }).nth(3).click()
  await expect(page.getByRole('heading', { name: '回复与处理' })).toBeVisible()
  await page.screenshot({ path: 'test-results/revision15-feedback-detail.png', fullPage: true })
  await expect(page.locator('.feedback-source')).toContainText('来源已删除')
  await expect(page.locator('.feedback-source a')).toHaveCount(0)
  await expect(page.locator('.feedback-layout > .el-card')).toHaveCount(2)
  await expect(page.locator('.feedback-layout')).toHaveCSS('column-gap', '40px')
  await page.getByRole('button', { name: '已处理', exact: true }).click()
  await expect(page.getByRole('button', { name: '发送并标记已处理' })).toBeDisabled()
  await page.getByLabel('回复内容').fill(`  ${'😀'.repeat(500)}  `)
  await expect(page.locator('.reply-count')).toHaveText('500／500')
  await expect(page.getByRole('button', { name: '发送并标记已处理' })).toBeEnabled()
  await page.getByRole('button', { name: '已处理', exact: true }).click()
  await expect(page.getByRole('button', { name: '发送回复', exact: true })).toBeEnabled()
  await page.getByLabel('回复内容').fill('😀'.repeat(501))
  await expect(page.getByRole('button', { name: '发送回复', exact: true })).toBeDisabled()
  await page.getByRole('link', { name: '返回反馈列表' }).click()
  const leaveDialog = page.getByRole('dialog', { name: '离开反馈处理？' })
  await expect(leaveDialog).toBeVisible()
  await leaveDialog.getByRole('button', { name: '继续编辑' }).click()
  await expect(page.getByLabel('回复内容')).toHaveValue('😀'.repeat(501))
  await page.getByLabel('回复内容').fill('')
  await page.setViewportSize({ width: 1000, height: 1000 })
  const cards = await page.locator('.feedback-layout > .el-card').all()
  expect((await cards[1]!.boundingBox())!.y).toBeGreaterThan((await cards[0]!.boundingBox())!.y)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('link', { name: '返回反馈列表' }).click()
  await expect(page).toHaveURL(/feedback\?status=pending&page=2$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300)
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})

test('expired administrator login restores the same-owner draft without submitting it', async ({
  page
}) => {
  let posts = 0
  await page.route('**/api/admin/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/messages')) {
      posts++
      await route.fulfill({
        status: 401,
        json: { error: { code: 'session_expired', message: '会话已过期' } }
      })
      return
    }
    const json = path.endsWith('/auth/session')
      ? { id: 'admin-one', username: 'admin', csrf_token: 'synthetic-token' }
      : path.endsWith('/auth/login')
        ? {
            administrator: { id: 'admin-one', username: 'admin' },
            csrf_token: 'synthetic-new-token'
          }
        : { ...feedback, unread: false }
    await route.fulfill({ json })
  })
  await page.goto('/feedback/FB1001')
  await page.getByLabel('回复内容').fill('会话到期前的草稿')
  await page.getByRole('button', { name: '发送回复', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?return=/)
  await page.getByLabel('管理员账号').fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: '登录后台' }).click()
  await expect(page).toHaveURL(/\/feedback\/FB1001$/)
  await expect(page.getByLabel('回复内容')).toHaveValue('会话到期前的草稿')
  expect(posts).toBe(1)
  expect(
    await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))
  ).not.toContain('会话到期前的草稿')
})

test('failed private screenshots renew and open the custom dialog without the default image viewer', async ({
  page
}) => {
  const image = {
    id: 'private-image',
    state: 'ready',
    url: '/api/admin/v1/feedback/images/expired-grant',
    content_type: 'image/png',
    width: 300,
    height: 200,
    size: 68
  }
  await page.route('**/api/admin/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/expired-grant')) {
      await route.fulfill({ status: 403, body: '' })
      return
    }
    if (path.endsWith('/renewed-grant')) {
      await route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
          'base64'
        )
      })
      return
    }
    const json = path.endsWith('/auth/session')
      ? { id: 'admin-one', username: 'admin', csrf_token: 'synthetic-token' }
      : path.endsWith('/private-image/url')
        ? { ...image, url: '/api/admin/v1/feedback/images/renewed-grant' }
        : { ...feedback, unread: false, events: [{ ...feedback.events[0], images: [image] }] }
    await route.fulfill({ json })
  })
  await page.goto('/feedback/FB1001')
  await page.getByRole('button', { name: '截图加载失败，点击重试' }).click()
  await expect(page.getByAltText('查看反馈截图')).toBeVisible()
  const thumbnailGeometry = await page.locator('.screenshot-button').evaluate((button) => {
    const outer = button.getBoundingClientRect()
    const image = button.querySelector('.el-image')!.getBoundingClientRect()
    return {
      buttonHeight: outer.height,
      imageHeight: image.height,
      top: image.top - outer.top,
      bottom: outer.bottom - image.bottom
    }
  })
  expect(thumbnailGeometry.imageHeight).toBe(100)
  expect(thumbnailGeometry.buttonHeight).toBeGreaterThanOrEqual(100)
  expect(thumbnailGeometry.top).toBeGreaterThanOrEqual(0)
  expect(thumbnailGeometry.bottom).toBeGreaterThanOrEqual(0)
  await page.getByRole('button', { name: '查看反馈截图' }).click()
  const dialog = page.getByRole('dialog', { name: '反馈截图' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByAltText('用户提交的反馈截图')).toBeVisible()
  await expect(page.locator('.el-image-viewer__wrapper')).toHaveCount(0)
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.feedback-message')).toContainText('请核对这句说明')
})
