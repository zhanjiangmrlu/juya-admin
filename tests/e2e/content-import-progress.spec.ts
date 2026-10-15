import type { Page } from '@playwright/test'

import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { mockWorkOrder, order, reading } from './fixtures/content-work-orders'

/**
 * 装配可控异步校验，仅用于浏览器状态回归，不代表真实服务验收
 * @param page - 本测试独立浏览器
 * @param firstReadFails - 是否模拟首次工作单网络中断
 * @returns 当前预览请求计数
 */
const setupImport = async (page: Page, firstReadFails = false) => {
  await mockWorkOrder(page)
  let reads = 0,
    orderReads = 0
  await page.route('**/api/v1/admin/content-production/work-orders/order', async (route) => {
    orderReads++
    if (firstReadFails && orderReads === 1) {
      await route.abort('failed')
      return
    }
    await route.fulfill({
      json: { ...order, counts: { ...order.counts, total: reads >= 2 ? 3 : 0 } }
    })
  })
  await page.route('**/content-imports/batch/stages', (route) =>
    route.fulfill({
      json: {
        batch_id: 'batch',
        stages: [
          {
            stage_id: 'validate',
            item_id: 'batch',
            stage: 'VALIDATE',
            status: 'RUNNING',
            attempt: 1,
            fencing_version: 1,
            input_hash: 'a'.repeat(64),
            config_version: 'v15.1',
            lease_until: null,
            next_retry_at: null,
            error_code: null
          }
        ]
      }
    })
  )
  await page.route('**/work-orders/order/import-preview', (route) => {
    reads++
    return route.fulfill({
      json: {
        work_order_id: 'order',
        batch_id: 'batch',
        status: reads >= 2 ? 'PREVIEW_READY' : 'PENDING',
        preview_hash: 'a'.repeat(64),
        preview_version: 1,
        batch_issues: [],
        unreferenced_files: [],
        items:
          reads < 2
            ? []
            : ['one', 'two', 'three'].map((id, index) => ({
                item_id: id,
                import_item_id: 'import-' + id,
                import_content_id: 'source-' + id,
                row_no: index + 2,
                operation: 'CREATE',
                status: 'PENDING',
                candidate: { ...reading, title_zh: '测试短文' + id },
                issues: [],
                defaults: [],
                resources: {},
                entries: [],
                source_snapshot: null,
                result: null
              }))
      }
    })
  })
  return { count: () => reads }
}

test('校验自动完成后停止更新并保留管理员勾选', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const calls = await setupImport(page)
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order?view=import&import_phase=validation')
  await expect(page.getByText('本次 0 篇', { exact: false })).toHaveCount(0)
  await expect(page.getByText('正在解析校验', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回批量导入', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '刷新进度', exact: true })).toHaveCount(0)
  await expect(page.getByText(/本次 3 篇/)).toBeVisible({ timeout: 7000 })
  await page.getByRole('button', { name: '查看合格预览', exact: true }).click()
  await page.getByText('测试短文one', { exact: true }).click()
  await expect(
    page.getByRole('button', { name: '确认保存选中 1 篇草稿', exact: true })
  ).toBeEnabled()
  const stoppedAt = calls.count()
  await page.waitForTimeout(4500)
  expect(calls.count()).toBe(stoppedAt)
  await expect(page.getByRole('checkbox', { name: '测试短文one', exact: true })).toBeChecked()
})

test('首次工作单读取瞬断也能自动恢复，无需手工刷新', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  await setupImport(page, true)
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order?view=import&import_phase=validation')
  await expect(page.getByText(/本次 3 篇/)).toBeVisible({ timeout: 9000 })
  await expect(page.getByRole('button', { name: '查看合格预览', exact: true })).toBeEnabled()
})
