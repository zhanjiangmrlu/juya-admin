import { expect, test } from '@playwright/test'

import type { Page } from '@playwright/test'

const learner = {
  id: 'contact-retirement-user',
  user_code: 'JY0071',
  nickname: '学习者071',
  registered_at: '2026-10-18T00:30:00Z',
  last_login_at: '2026-11-10T01:41:00Z',
  authorization: {
    status: 'active',
    starts_on: '2026-10-24',
    expires_on: '2026-11-24',
    expires_at: '2026-11-24T16:00:00Z',
    revision: 1
  },
  statistics: {
    completed_cards: 12,
    completed_articles: 4,
    current_streak: 3,
    total_checkin_days: 7,
    checked_in_today: false,
    favorite_count: 5,
    listening_favorite_count: 3,
    longest_streak: 3,
    last_studied_at: '2026-10-26T01:41:00Z'
  }
}

/** 用隔离契约资料验证用户页面，不访问现有本地或远程业务数据
 * @param page 当前浏览器测试页面
 * @param count 正常列表一页返回的用户数
 */
const mockUsers = async (page: Page, count = 3) => {
  await page.route('**/api/admin/v1/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname
    let json: unknown = { items: [], total: 0, page: 1, limit: 20 }
    if (path.endsWith('/auth/session'))
      json = { id: 'synthetic-admin', username: '内容管理员', csrf_token: 'synthetic' }
    else if (path.endsWith('/users')) {
      const empty = url.searchParams.get('search') === 'missing'
      json = {
        items: empty
          ? []
          : Array.from({ length: count }, (_, index) => ({
              ...learner,
              id: index ? `synthetic-user-${index}` : learner.id,
              user_code: `JY00${71 + index}`,
              nickname: `学习者${71 + index}`
            })),
        total: empty ? 0 : 128,
        page: empty ? 1 : Number(url.searchParams.get('page') || 1),
        limit: 20,
        statistical_date: '2026-11-10'
      }
    } else if (/\/users\/[^/]+$/.test(path)) json = learner
    else if (path.endsWith('/learning-authorization/history'))
      json = {
        items: [
          {
            id: 'synthetic-audit',
            admin_id: 'synthetic-admin',
            action: 'grant',
            occurred_at: '2026-10-24T01:41:00Z',
            before: { status: 'none' },
            after: learner.authorization
          }
        ],
        total: 1,
        page: 1,
        limit: 10
      }
    await route.fulfill({ json })
  })
}

test('keeps the empty user table, resets filters and retains identity, learning and audit panels', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1025 })
  await mockUsers(page)
  await page.goto('/users')
  await expect(page.locator('.users-table tbody tr')).toHaveCount(3)
  await expect(page.locator('.users-table thead')).not.toContainText('联系方式')
  await expect(page.locator('.user-list-page')).not.toContainText('手机号')
  await expect(page.locator('.authorization-cell .el-tag').first()).toHaveText('授权有效')
  await expect(page.locator('.authorization-cell .el-tag').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: 'test-results/contact-retirement-list.png',
    fullPage: true,
    animations: 'disabled'
  })

  await page.locator('.user-filters .el-select').first().click()
  await page.getByRole('option', { name: '授权有效', exact: true }).click()
  await page.getByLabel('搜索用户', { exact: true }).fill('missing')
  await page.getByRole('button', { name: '查询用户', exact: true }).click()
  await expect(page.getByRole('heading', { name: '没有符合条件的用户' })).toBeVisible()
  await expect(page.getByLabel('搜索用户', { exact: true })).toHaveValue('missing')
  await expect(page.locator('.user-filters')).toContainText('授权有效')
  await expect(page.locator('.users-table thead th')).toHaveCount(8)
  await expect(page.locator('.users-table')).toContainText(
    '试试其他用户编号或昵称，或清空筛选后查看。'
  )
  await expect(page.locator('.pagination-total')).toHaveText('匹配 0 位用户 · 注册时间倒序')
  await expect(page.getByRole('button', { name: '上一页', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
  const image = page.locator('.user-empty .el-empty__image img')
  await expect(image).toBeVisible()
  expect(
    await image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)
  ).toBe(true)
  const bounds = await image.boundingBox()
  expect(bounds!.width).toBe(36)
  expect(bounds!.height).toBe(36)
  await page.screenshot({
    path: 'test-results/contact-retirement-empty.png',
    fullPage: true,
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '清空筛选', exact: true }).click()
  await expect(page.getByLabel('搜索用户', { exact: true })).toHaveValue('')
  await expect(page.locator('.user-filters')).toContainText('全部授权状态')
  await expect(page.locator('.users-table tbody tr')).toHaveCount(3)
  await expect(page.getByRole('heading', { name: '没有符合条件的用户' })).toHaveCount(0)
  await page.getByRole('link', { name: '查看详情', exact: true }).first().click()
  await expect(page).toHaveURL(new RegExp(`/users/${learner.id}`))
  await expect(page.locator('.account-panel')).toContainText('JY0071')
  await expect(page.locator('.account-panel')).toContainText('微信身份登录')
  await expect(page.locator('.account-panel')).not.toContainText('手机号')
  await expect(page.locator('.account-panel')).not.toContainText('微信号')
  await expect(page.locator('.account-panel')).not.toContainText('联系资料')
  await expect(page.locator('.learning-panel')).toContainText('场景 5 张／听读 3 篇')
  await expect(page.getByRole('button', { name: '续期一个月', exact: true })).toBeVisible()
  await expect(page.locator('.authorization-history')).toContainText('synthetic-admin')
  await expect(page.getByRole('heading', { name: '学习记录', exact: true })).toBeVisible()
  await page.screenshot({
    path: 'test-results/contact-retirement-detail.png',
    fullPage: true,
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})

test('restores filtered pagination and scroll when returning from UUID detail routes', async ({
  page
}) => {
  await mockUsers(page, 20)
  const target =
    '/users?search=JY&registered=today&checkin=unchecked&authorization_status=active&page=2'
  await page.goto(target)
  await expect(page.locator('.users-table tbody tr')).toHaveCount(20)
  await page.evaluate(() => window.scrollTo({ top: 650 }))
  const remembered = await page.evaluate(() => scrollY)
  await page.getByRole('link', { name: '查看详情', exact: true }).nth(4).click()
  await expect(page.locator('.account-panel')).toContainText('JY0071')
  await page.getByRole('link', { name: '返回用户列表', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname + url.search === target)
  await expect(page.getByLabel('搜索用户', { exact: true })).toHaveValue('JY')
  await expect(page.locator('.user-filters')).toContainText('今日注册')
  await expect(page.locator('.user-pagination .is-active')).toHaveText('2')
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(remembered)
  expect(remembered).toBe(650)
})
