import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('最近审计事件支持分页、固定表头和表格内部滚动', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  await page.route('**/api/v1/admin/audit-events?*', async (route) => {
    await route.fulfill({
      json: {
        items: Array.from({ length: 50 }, (_, index) => ({
          action: `audit.action-${index + 1}`,
          actor_public_id: '1',
          after_summary: {},
          before_summary: {},
          object_public_id: `OBJECT-${index + 1}`,
          object_type: 'settings',
          occurred_at: '2026-10-08T13:42:19Z',
          reason: null,
          request_id: `web-9684f3b5-5187-4a26-bc86-${String(index + 1).padStart(12, '0')}`
        }))
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/settings')
  const card = page.locator('.audit-card')
  const pagination = card.getByRole('navigation', { name: '列表分页' })
  await expect(pagination.getByText('共 50 条')).toBeVisible()
  await expect(card.locator('.el-table__body tbody tr')).toHaveCount(10)
  await pagination.getByRole('button', { name: '下一页' }).click()
  await expect(card.getByText('audit.action-11', { exact: true })).toBeVisible()
  const jump = pagination.locator('.el-pagination__jump input')
  await jump.fill('5')
  await jump.press('Enter')
  await expect(card.getByText('audit.action-41', { exact: true })).toBeVisible()
  await pagination.getByRole('combobox', { name: '每页条数' }).press('Enter')
  await page.getByRole('option', { name: '50 条/页', exact: true }).click()
  await expect(card.locator('.el-table__body tbody tr')).toHaveCount(50)
  await expect(pagination.locator('.el-pager .is-active')).toHaveText('1')
  const scroll = card.locator('.el-table__body-wrapper .el-scrollbar__wrap')
  const header = card.locator('.el-table__header-wrapper')
  await card.scrollIntoViewIfNeeded()
  const before = await header.boundingBox()
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true)
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  const after = await header.boundingBox()
  expect(after?.y).toBe(before?.y)
  await expect(card.getByText('audit.action-50', { exact: true })).toBeVisible()
  await expect(pagination).toBeVisible()
  await page.setViewportSize({ width: 760, height: 800 })
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollWidth > element.clientWidth))
    .toBe(true)
  await scroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
})
