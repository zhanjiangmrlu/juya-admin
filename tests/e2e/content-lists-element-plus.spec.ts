import { expect, test } from '@playwright/test'

import type { Page } from '@playwright/test'

import { emptyPayload } from '../../src/features/listening/listening-model'

/** 提供隔离列表数据，支持真实路由筛选、翻页、空态与失败重试
 * @param page 本次测试的独立浏览器页面
 */
const mockLists = async (page: Page) => {
  let failNext = false
  await page.route('**/api/admin/v1/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      current = Number(url.searchParams.get('page') || 1),
      search = url.searchParams.get('q') || url.searchParams.get('search')
    if (path.endsWith('/auth/session')) {
      await route.fulfill({
        json: { id: 'list-admin', username: '列表验收', csrf_token: 'synthetic' }
      })
      return
    }
    if (path.endsWith('/cards') || path.endsWith('/articles')) {
      if (search === 'error' && !failNext) {
        failNext = true
        await route.fulfill({ status: 503, json: { detail: '列表暂不可用' } })
        return
      }
      const items = Array.from({ length: search === 'empty' ? 0 : 10 }, (_, index) => {
        const id = `${current}-${index}`,
          title =
            search === 'long'
              ? '超长的场景与听读文章标题'.repeat(12)
              : index === 0
                ? '和同事聊天'
                : `场景与听读${index + 1}`
        return path.endsWith('/cards')
          ? {
              id,
              display_name: title,
              display_title_en: 'Chatting with Coworkers',
              display_image_id: 'list-image',
              display_thumbnail_id: 'list-image',
              status: 'published',
              current_version_id: 'v1',
              draft_revision: 1,
              content: { name: title, dialogue: [], vocabulary: [], chunks: [] },
              sort_order: index,
              updated_at: '2026-11-03T14:03:00Z',
              has_unpublished_changes: false,
              issues: [],
              is_free: false,
              free_revision: 1
            }
          : {
              id,
              category_id: 'category',
              status: 'published',
              revision: 1,
              payload: {
                ...emptyPayload(),
                title_zh: title,
                title_en: 'Chatting with Coworkers',
                audio_id: 'audio'
              },
              is_free: false,
              free_revision: 1,
              has_unpublished_changes: false,
              word_count: 111,
              created_at: '2026-11-03T14:03:00Z'
            }
      })
      await route.fulfill({
        json: {
          items,
          total: search === 'empty' ? 0 : 20,
          page: current,
          limit: 10,
          total_pages: search === 'empty' ? 0 : 2,
          learning_policy: { actual_free_count: 17 }
        }
      })
      return
    }
    if (path.endsWith('/media/list-image')) {
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="64"><rect width="48" height="64" fill="#c8e2b5"/></svg>'
      })
      return
    }
    await route.fulfill({
      json: path.endsWith('/free-policy')
        ? { article_ids: Array.from({ length: 17 }, (_, index) => String(index)), revision: 1 }
        : path.endsWith('/categories')
          ? {
              items: [{ id: 'category', name: 'English In Real Life', sort_order: 1, revision: 1 }]
            }
          : []
    })
  })
}

for (const width of [1440, 1911]) {
  for (const [path, heading, selectAll] of [
    ['/cards', '卡片管理', '选择本页卡片'],
    ['/listening', '听读文章管理', '全选当前页文章']
  ]) {
    test(`${path} preserves layout and list behavior at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1911 ? 837 : 1000 })
      await mockLists(page)
      await page.goto(path!)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      const rows = page.locator('.table-wrap tbody tr')
      await expect(rows).toHaveCount(10)
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({
        path: `test-results/element-plus-${path!.slice(1)}-${width}.png`
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      await page.locator(`.el-checkbox[aria-label="${selectAll}"]`).click()
      await expect(rows.locator('input:checked')).toHaveCount(10)
      await page.locator(`.el-checkbox[aria-label="${selectAll}"]`).click()
      await expect(rows.locator('input:checked')).toHaveCount(0)
      await rows.first().locator('.el-checkbox').click()
      await expect(page.getByRole('checkbox', { name: selectAll, exact: true })).toHaveJSProperty(
        'indeterminate',
        true
      )
      await page.getByRole('button', { name: '下一页', exact: true }).click()
      await expect(page).toHaveURL(/page=2/)
      await expect(page.locator('.loading')).toHaveCount(0)
      await expect(rows.locator('input:checked')).toHaveCount(0)
      await page.locator('.filters input').first().fill('empty')
      await page.locator('.filters button[type="submit"]').click()
      await expect(page).toHaveURL(/page=1/)
      await expect(
        page.getByRole('heading', {
          name: path === '/cards' ? '暂无场景卡片' : '暂无符合条件的文章'
        })
      ).toBeVisible()
      await page.locator('.filters input').first().fill('error')
      await page.locator('.filters button[type="submit"]').click()
      await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '重试', exact: true }).click()
      await expect(rows).toHaveCount(10)
      // 新表体先注册行，再完成列布局；等待页面足够高后设置需要恢复的位置
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight))
        .toBeGreaterThan(500)
      await page.evaluate(() => scrollTo(0, 500))
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(500)
      await page
        .locator('.sidebar a')
        .filter({ hasText: path === '/cards' ? '听读管理' : '场景卡片' })
        .click()
      await expect(
        page.getByRole('heading', {
          name: path === '/cards' ? '听读文章管理' : '卡片管理',
          exact: true
        })
      ).toBeVisible()
      await page.goBack()
      await expect(rows).toHaveCount(10)
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(500)
      await page.locator('.filters input').first().fill('long')
      await page.locator('.filters button[type="submit"]').click()
      await expect(rows.first()).toContainText('超长的场景与听读文章标题'.repeat(12))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      const titleCell = rows.first().locator('td').nth(1)
      expect(await titleCell.evaluate((cell) => cell.scrollWidth <= cell.clientWidth)).toBe(true)
      await expect(rows.first().getByRole('button', { name: '删除', exact: true })).toBeVisible()
    })
  }
}
