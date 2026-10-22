import { expect, test } from '@playwright/test'

import type { FeedbackDetail } from '../../src/shared/types/feedback'

const feedback: FeedbackDetail = {
  id: 'FB1001',
  user_id: 'U1001',
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
  await expect(page.locator('tbody tr')).toHaveCount(10)
  await page.screenshot({ path: 'test-results/revision15-feedback-list.png', fullPage: true })
  await page.evaluate(() => window.scrollTo(0, 300))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300)
  await page.getByRole('link', { name: '查看并处理' }).nth(3).click()
  await expect(page.getByRole('heading', { name: '回复与处理' })).toBeVisible()
  await page.screenshot({ path: 'test-results/revision15-feedback-detail.png', fullPage: true })
  await expect(page.locator('.feedback-source')).toContainText('来源已删除')
  await expect(page.locator('.feedback-source a')).toHaveCount(0)
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
