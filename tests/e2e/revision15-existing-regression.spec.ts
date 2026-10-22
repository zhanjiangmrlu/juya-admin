import { expect, test } from '@playwright/test'

import type { Page, Route } from '@playwright/test'

const pageErrors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([])
})

const user = {
  id: 'U1001',
  nickname: 'Readonly',
  registered_at: '2026-10-22T01:00:00Z',
  statistics: {
    completed_cards: 0,
    current_streak: 0,
    total_checkin_days: 0,
    checked_in_today: false
  }
}
const rows = {
  items: Array.from({ length: 20 }, (_, index) => ({ ...user, id: `U${1001 + index}` })),
  total: 40,
  page: 2,
  limit: 20,
  statistical_date: '2026-10-22'
}
const target = '/users?search=Readonly&registered=today&checkin=unchecked&page=2&from=statistics'
const snapshot = {
  user_count: 8,
  new_users_today: 2,
  published_card_count: 3,
  statistical_date: '2026-10-21',
  updated_at: '2026-10-21T15:59:59Z'
}

/** 所有API使用隔离合成响应，未定义请求也不会落入代理
 * @param route 浏览器发出的API请求
 */
const fallback = async (route: Route) => {
  const path = new URL(route.request().url()).pathname
  await route.fulfill({
    json: path.endsWith('/auth/session')
      ? { id: 'admin-synthetic', username: 'admin', csrf_token: 'synthetic' }
      : path.endsWith('/users')
        ? rows
        : /\/users\/[^/]+$/.test(path)
          ? user
          : path.endsWith('/statistics')
            ? snapshot
            : path.endsWith('/card-action-batches') || path.endsWith('/publication-batches')
              ? []
              : { items: [], total: 0, page: 1, limit: 10, total_pages: 0 }
  })
}

/** 人为重现回前台的两个浏览器事件
 * @param page 实际Chrome页面
 * @returns 浏览器事件派发完成
 */
const foreground = async (page: Page) =>
  page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })

test('A05 restores explicit and browser returns, resets changed filters and retains the A07 return', async ({
  page
}) => {
  const methods: string[] = []
  await page.route('**/api/**', async (route) => {
    methods.push(route.request().method())
    await fallback(route)
  })
  await page.goto(target)
  await expect(page.locator('tbody tr')).toHaveCount(20)
  for (const back of ['explicit', 'history']) {
    await page.evaluate(() => window.scrollTo(0, 650))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(650)
    await page.getByRole('link', { name: '查看详情' }).nth(5).click()
    await expect(page.getByRole('heading', { name: 'Readonly · 用户详情' })).toBeVisible()
    if (back === 'explicit') await page.getByRole('link', { name: '返回用户列表' }).click()
    else await page.goBack()
    await expect(page).toHaveURL(new RegExp(`${target.replaceAll('?', '\\?')}$`))
    await expect(page.locator('tbody tr')).toHaveCount(20)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(650)
    await expect(page.getByLabel('搜索用户')).toHaveValue('Readonly')
  }
  await page.getByRole('button', { name: '全部注册', exact: true }).click()
  await expect(page).toHaveURL(/registered=all.*page=1/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.getByRole('link', { name: '返回数据统计' }).click()
  await expect(page.getByRole('heading', { name: '数据统计' })).toBeVisible()
  expect(methods.every((method) => method === 'GET')).toBe(true)
})

test('A05 ignores a delayed returning list response after entering the next detail', async ({
  page
}) => {
  let reads = 0,
    release!: () => void
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/users') && ++reads === 2)
      await new Promise<void>((resolve) => {
        release = resolve
      })
    await fallback(route)
  })
  await page.goto(target)
  await expect(page.locator('tbody tr')).toHaveCount(20)
  await page.evaluate(() => window.scrollTo(0, 650))
  await page.getByRole('link', { name: '查看详情' }).nth(5).click()
  await page.getByRole('link', { name: '返回用户列表' }).click()
  await expect.poll(() => reads).toBe(2)
  // Browser Back re-enters the detail while the list refresh remains pending.
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Readonly · 用户详情' })).toBeVisible()
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    ;(window as Window & { lateScrolls?: number }).lateScrolls = 0
    window.addEventListener('scroll', () => {
      ;(window as Window & { lateScrolls: number }).lateScrolls++
    })
  })
  const pending = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/users')
  )
  release()
  await pending
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  expect(await page.evaluate(() => (window as Window & { lateScrolls: number }).lateScrolls)).toBe(
    0
  )
})

for (const outcome of ['success', 'failure'])
  test(`A07 rechecks the server day after delayed ${outcome} and coalesced foreground events`, async ({
    page
  }) => {
    let reads = 0,
      release!: () => void
    await page.route('**/api/**', async (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/statistics')) {
        const number = ++reads
        const captured =
          number === 1
            ? snapshot
            : { ...snapshot, statistical_date: '2026-10-22', new_users_today: 0 }
        if (number === 1)
          await new Promise<void>((resolve) => {
            release = resolve
          })
        await route.fulfill(
          number === 1 && outcome === 'failure'
            ? { status: 503, json: { error: { code: 'unavailable', message: '暂不可用' } } }
            : { json: captured }
        )
        return
      }
      await fallback(route)
    })
    await page.goto('/statistics')
    await expect.poll(() => reads).toBe(1)
    await expect(page.locator('.metric-value')).toHaveCount(0)
    await foreground(page)
    expect(reads).toBe(1)
    release()
    await expect(page.locator('.overview-period')).toContainText('2026-10-22')
    await expect(page.locator('.metric-value')).toHaveText(['8', '0', '3'])
    expect(reads).toBe(2)
  })

test('A07 distinguishes zero and two failure states and opens all three current filtered lists', async ({
  page
}) => {
  let reads = 0
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/statistics')) {
      ++reads
      await route.fulfill(
        reads === 1 || reads === 3
          ? { status: 503, json: { error: { code: 'unavailable', message: '暂不可用' } } }
          : { json: { ...snapshot, user_count: 0, new_users_today: 0, published_card_count: 0 } }
      )
      return
    }
    await fallback(route)
  })
  await page.goto('/statistics')
  await expect(page.locator('.unavailable')).toHaveCount(3)
  await expect(page.locator('.metric-value')).toHaveCount(0)
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.locator('.metric-value')).toHaveText(['0', '0', '0'])
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.locator('.overview-period')).toContainText('暂未更新')
  await expect(page.locator('.metric-value')).toHaveText(['0', '0', '0'])
  for (const [metric, path, query] of [
    ['users', '/users', 'registered=all&checkin=all&from=statistics'],
    ['new-users', '/users', 'registered=today&checkin=all&from=statistics'],
    ['cards', '/cards', 'status=published&from=statistics']
  ]) {
    await page.locator(`[data-metric="${metric}"]`).click()
    await expect(page).toHaveURL(new RegExp(`${path}\\?${query}$`))
    await page.getByRole('link', { name: '返回数据统计' }).click()
    await expect(page.locator('.metric-value')).toHaveText(['0', '0', '0'])
  }
})

test('A07 opens the latest list after a new registration and refreshes on return', async ({
  page
}) => {
  let listRead = false,
    statisticsReads = 0
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/statistics')) {
      statisticsReads++
      await route.fulfill({
        json: listRead
          ? { ...snapshot, user_count: 9, updated_at: '2026-10-21T16:00:01Z' }
          : snapshot
      })
    } else if (path.endsWith('/users')) {
      listRead = true
      await route.fulfill({ json: { ...rows, items: rows.items.slice(0, 9), total: 9, page: 1 } })
    } else await fallback(route)
  })
  await page.goto('/statistics')
  await expect(page.locator('[data-metric="users"] .metric-value')).toHaveText('8')
  const updated = await page.locator('.overview-period').textContent()
  await page.locator('[data-metric="users"]').click()
  await expect(page.locator('tbody tr')).toHaveCount(9)
  await expect(page.locator('.pagination-total')).toContainText('共 9 位用户')
  await page.getByRole('link', { name: '返回数据统计' }).click()
  await expect(page.locator('[data-metric="users"] .metric-value')).toHaveText('9')
  expect(await page.locator('.overview-period').textContent()).not.toBe(updated)
  expect(statisticsReads).toBe(2)
})

test('A06 opens the real published preview with disabled learner controls and no Mini traffic', async ({
  page
}) => {
  const requests: { path: string; method: string }[] = []
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    requests.push({ path, method: route.request().method() })
    if (path.endsWith('/learning-records')) {
      await route.fulfill({
        json: {
          items: [{ id: 'card', name: '点茶', title_en: 'Ordering Tea', available: true }],
          total: 1,
          page: 1
        }
      })
    } else if (path.endsWith('/published')) {
      await route.fulfill({
        json: {
          card_id: 'card',
          version_id: 'published-version',
          mode: 'published',
          content: {
            name: '点茶',
            title_en: 'Ordering Tea',
            dialogue: [
              { id: 'line', speaker: 'A', english: 'Tea, please.', chinese: '请给我茶。' }
            ],
            vocabulary: [],
            chunks: []
          }
        }
      })
    } else await fallback(route)
  })
  await page.goto('/users/U1001')
  await page.getByRole('button', { name: '查看发布内容', exact: true }).click()
  const preview = page.getByRole('dialog', { name: '已发布内容 · 只读查看', exact: true })
  await expect(preview).toBeVisible()
  await expect(preview.getByRole('button', { name: '中央查词（预览）' })).toBeDisabled()
  await expect(preview.getByRole('button', { name: '收藏（预览）' })).toBeDisabled()
  await expect(preview.getByRole('button', { name: '已完成学习（预览）' })).toBeDisabled()
  await expect(preview.getByRole('button', { name: '确认发布' })).toHaveCount(0)
  await preview.getByRole('button', { name: '显示译文' }).click()
  await expect(preview.locator('.translation-section')).toContainText('请给我茶。')
  await page.screenshot({ path: 'test-results/revision15-batch6-published-preview.png' })
  await preview.getByRole('button', { name: '关闭预览', exact: true }).click()
  await expect(preview).toHaveCount(0)
  expect(
    requests.every(({ path, method }) => path.startsWith('/api/admin/v1/') && method === 'GET')
  ).toBe(true)
})
