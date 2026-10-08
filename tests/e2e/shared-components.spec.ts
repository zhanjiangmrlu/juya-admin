import { expect, test } from './fixtures/admin-api'

test('公共卡片保留系统配置标题的字号与行高', async ({ adminApi, page }) => {
  await page.goto('/settings')
  const heading = page.getByRole('heading', { name: '系统与审核配置', exact: true })
  await expect(heading).toBeVisible()
  await expect(heading).toHaveCSS('font-size', '20px')
  await expect(heading).toHaveCSS('line-height', '30px')
  const review = page.getByRole('heading', { name: '发布前复核', exact: true })
  await expect(review).toHaveCSS('font-size', '20px')
  await expect(review).toHaveCSS('line-height', '30px')
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('公共表格与禁用表单保留页面原有表面颜色', async ({ adminApi, page }) => {
  await page.goto('/feedback')
  const table = page.locator('.feedback-table.el-table')
  await expect(table).toBeVisible()
  expect(
    await table.evaluate((node) =>
      getComputedStyle(node).getPropertyValue('--el-table-header-bg-color').trim()
    )
  ).toBe('#e8f0e1')
  await page.goto('/campaigns/CAMP-1/edit')
  const disabledInput = page
    .locator('.configuration-card .el-input.is-disabled .el-input__wrapper')
    .first()
  await expect(disabledInput).toBeVisible()
  await expect(disabledInput).toHaveCSS('background-color', 'rgb(255, 253, 247)')
  expect(adminApi.unexpectedRequests).toEqual([])
})
