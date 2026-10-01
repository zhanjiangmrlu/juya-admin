import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('内容分页使用中文，跳页与条数选择驱动服务端查询', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const queries: { page: number; size: number }[] = []
  await page.route('**/api/v1/admin/content/scenes?*', async (route) => {
    const url = new URL(route.request().url())
    const currentPage = Number(url.searchParams.get('page'))
    const size = Number(url.searchParams.get('page_size'))
    queries.push({ page: currentPage, size })
    const start = (currentPage - 1) * size
    await route.fulfill({
      json: {
        items: Array.from({ length: Math.max(0, Math.min(size, 37 - start)) }, (_, index) => ({
          id: `SCENE-${start + index + 1}`,
          title: `分页场景 ${start + index + 1}`,
          summary: '分页验证',
          series_id: 'SERIES-1',
          series_title: '日常英语',
          status: 'DRAFT',
          draft_revision_id: 'REV-1',
          published_revision_id: null,
          cover_object_key: null,
          updated_at: '2026-10-01T16:01:33.846852Z'
        })),
        total: 37,
        page: currentPage,
        page_size: size
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes')
  const pagination = page.getByRole('navigation', { name: '列表分页' })
  await expect(pagination.getByText('共 37 条')).toBeVisible()
  await expect(pagination.getByText('10 条/页', { exact: true })).toBeVisible()
  await expect(page.locator('.el-table__body tbody tr')).toHaveCount(10)
  await expect(page.getByText('2026-10-02 00:01:33', { exact: true }).first()).toBeVisible()
  const jump = pagination.locator('.el-pagination__jump input')
  await jump.fill('4')
  await jump.press('Enter')
  await expect(page.getByText('分页场景 31', { exact: true })).toBeVisible()
  await expect(page.locator('.el-table__body tbody tr')).toHaveCount(7)
  await pagination.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/content-pagination.png', fullPage: true })
  await pagination.getByRole('combobox', { name: '每页条数' }).press('Enter')
  await page.getByRole('option', { name: '20 条/页', exact: true }).click()
  await expect(page.getByText('分页场景 1', { exact: true })).toBeVisible()
  await expect(page.locator('.el-table__body tbody tr')).toHaveCount(20)
  expect(queries).toEqual([
    { page: 1, size: 10 },
    { page: 4, size: 10 },
    { page: 1, size: 20 }
  ])
  await page.setViewportSize({ width: 820, height: 900 })
  await expect(pagination.getByRole('combobox', { name: '每页条数' })).toBeVisible()
  await expect(jump).toBeVisible()
})

test('用户列表无总数时仍可输入跳页并切换条数', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  await loginAsAdmin(page)
  await navigateInApp(page, '/users')
  const pagination = page.getByRole('navigation', { name: '列表分页' })
  await expect(pagination.getByText('第 1 页')).toBeVisible()
  await expect(pagination.getByRole('button', { name: '下一页' })).toBeDisabled()
  await pagination.getByRole('spinbutton', { name: '跳转页码' }).fill('3')
  const nextQuery = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/v1/admin/users' && url.searchParams.get('page') === '3'
  })
  await pagination.getByRole('button', { name: '跳转', exact: true }).click()
  expect(new URL((await nextQuery).url()).searchParams.get('page_size')).toBe('10')
  await expect(pagination.getByText('第 3 页')).toBeVisible()
  const sizeQuery = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/v1/admin/users' && url.searchParams.get('page_size') === '20'
  })
  await pagination.getByRole('combobox', { name: '每页条数' }).press('Enter')
  await page.getByRole('option', { name: '20 条/页', exact: true }).click()
  expect(new URL((await sizeQuery).url()).searchParams.get('page')).toBe('1')
  await expect(pagination.getByText('第 1 页')).toBeVisible()
})
