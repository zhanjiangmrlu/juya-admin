import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { mockWorkOrder, order, scene } from './fixtures/content-work-orders'

test('A17与1000逻辑批次独立结果和任务页面', async ({ page, adminApi }, testInfo) => {
  expect(adminApi.unexpectedRequests).toEqual([])
  const requests = await mockWorkOrder(page, { template: 'dialogue', content: scene })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/work-orders/order/phases', (route) =>
    route.fulfill({
      json: {
        work_order_id: 'order',
        version: 1,
        counts: order.counts,
        phases: [
          { key: 'parsing', label: '分篇 / 中英文配对', counts: { total: 1000, succeeded: 1000 } },
          {
            key: 'matching',
            label: '素材与词库匹配',
            counts: { total: 1000, succeeded: 940, review_required: 60 }
          },
          {
            key: 'audio',
            label: '音频对齐与单句文件',
            counts: { total: 1000, succeeded: 960, failed: 40 }
          },
          {
            key: 'publication',
            label: '校对与发布',
            counts: { total: 1000, review_required: 1000 }
          }
        ]
      }
    })
  )
  await page.route('**/work-orders/order/usage', (route) =>
    route.fulfill({
      json: {
        work_order_id: 'order',
        attempts: [],
        retry_count: 0,
        unknown_count: 0,
        source_text_count: 1000,
        source_unknown_count: 0,
        source_text_utf8_bytes: 820000,
        measured_audio_ms: 64800000,
        audio_unknown_count: 0,
        planned: [],
        potential: [],
        known_list_price_subtotal_cny: null,
        unpriced_attempt_count: 0
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes')
  await expect(page.getByRole('heading', { name: '内容生产', exact: true })).toBeVisible()
  await expect(page.locator('th').filter({ hasText: '生产进度' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('task4-a17-1440.png'), fullPage: true })
  await navigateInApp(page, '/content/work-orders/order?view=overview')
  await expect(page.getByRole('heading', { name: '自动整理结果', exact: true })).toBeVisible()
  await expect(page.getByText('900', { exact: true })).toBeVisible()
  await expect(page.locator('.work-overview th')).toHaveText([
    '篇目',
    '问题位置',
    '问题',
    '修正入口'
  ])
  await expect(page.locator('.tabs')).toHaveCount(0)
  await expect
    .poll(() => requests.filter((request) => request.path.endsWith('/items')).length)
    .toBeGreaterThanOrEqual(12)
  await page.screenshot({ path: testInfo.outputPath('task4-a20-1440.png'), fullPage: true })
  await navigateInApp(page, '/content/work-orders/order?view=jobs')
  await expect(page.getByRole('heading', { name: '批量任务', exact: true })).toBeVisible()
  await expect(page.getByText('音频对齐与单句文件', { exact: true })).toBeVisible()
  await expect(page.getByText('960 篇已完成，40 篇失败', { exact: true })).toBeVisible()
  await expect(page.getByText(/64800 秒/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('task4-a24-1440.png'), fullPage: true })
  await page.reload()
  await expect(page.getByRole('heading', { name: '批量任务', exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
})

test('ZIP上传校验预览结果按持久记录恢复，成功草稿不重试', async ({ page, adminApi }, testInfo) => {
  expect(adminApi.unexpectedRequests).toEqual([])
  await mockWorkOrder(page, { template: 'dialogue', content: scene })
  await page.setViewportSize({ width: 1440, height: 900 })
  let confirmed = false
  const preview = () => ({
    work_order_id: 'order',
    batch_id: 'batch',
    status: confirmed ? 'PARTIAL' : 'PREVIEW_READY',
    preview_hash: 'a'.repeat(64),
    preview_version: 1,
    batch_issues: [],
    unreferenced_files: ['extra.txt'],
    items: [
      {
        item_id: 'one',
        import_item_id: 'import-one',
        import_content_id: 'scene-coffee',
        row_no: 5,
        status: confirmed ? 'SUCCESS' : 'PENDING',
        operation: confirmed ? 'SKIP' : 'CREATE',
        candidate: scene,
        defaults: ['default_cover'],
        issues: [],
        resources: {},
        entries: [],
        source_snapshot: { blocks: [{ text: 'Original English and Chinese source.' }] },
        result: confirmed
          ? {
              item_id: 'import-one',
              status: 'SUCCESS',
              operation: 'CREATE',
              content_id: 'SCENE-1',
              revision_id: 'revision'
            }
          : null
      },
      {
        item_id: 'two',
        import_item_id: 'import-two',
        import_content_id: 'scene-station',
        row_no: 6,
        status: confirmed ? 'FAILED' : 'PENDING',
        operation: 'CREATE',
        candidate: { ...scene, title_zh: '车站' },
        defaults: [],
        issues: [
          {
            id: 'missing-audio',
            code: 'IMPORT_RESOURCE_INVALID',
            message: '音频包内路径不存在',
            severity: 'ERROR',
            location: ['audio_path'],
            correction_target: 'source'
          }
        ],
        resources: {},
        entries: [],
        source_snapshot: null,
        result: confirmed
          ? { item_id: 'import-two', status: 'FAILED', error_code: 'IMPORT_RESOURCE_INVALID' }
          : null
      }
    ]
  })
  await page.route('**/work-orders/order/import-preview', (route) =>
    route.fulfill({ json: preview() })
  )
  await page.route('**/work-orders/order/import-confirm', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      selected_item_ids: ['one'],
      preview_hash: 'a'.repeat(64),
      acknowledged_defaults: ['default_cover']
    })
    confirmed = true
    await route.fulfill({
      json: { command_id: 'imported', work_order_id: 'order', version: 1, status: 'QUEUED' }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import')
  await page.screenshot({ path: testInfo.outputPath('task4-a18-entry-1440.png'), fullPage: true })
  await navigateInApp(page, '/content/import?source=zip&series_id=series&content_type=dialogue')
  await expect(page.getByRole('heading', { name: '上传统一内容包', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('task4-zip-upload-1440.png'), fullPage: true })
  await navigateInApp(page, '/content/work-orders/order?view=import&import_phase=validation')
  await expect(page.getByRole('heading', { name: '校验内容包', exact: true })).toBeVisible()
  await expect(page.getByText('第 6 行 · scene-station', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('task4-zip-validation-1440.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: '查看合格预览', exact: true }).click()
  await expect(page.getByRole('heading', { name: '核对图文与音频', exact: true })).toBeVisible()
  await page.locator('.import-preview .el-table').getByText('点一杯咖啡', { exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('task4-zip-preview-1440.png'), fullPage: true })
  await page.getByText('查看正文、译文、图片角色与音频 · 点一杯咖啡', { exact: true }).click()
  await expect(
    page.getByText('Original English and Chinese source.', { exact: true })
  ).toBeVisible()
  await page.getByText('确认使用默认封面', { exact: true }).click()
  await page.screenshot({
    path: testInfo.outputPath('task4-zip-preview-detail-1440.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: '确认保存选中 1 篇草稿', exact: true }).click()
  await expect(page).toHaveURL(/import_phase=result/)
  await expect(page.getByText('新增 1 篇', { exact: false })).toBeVisible()
  await expect(page.getByText('导入完成，尚未发布', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('task4-zip-result-1440.png'), fullPage: true })
  await page.reload()
  await expect(page.getByText('新增 1 篇', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '核对后仅重试失败篇目', exact: true }).click()
  await expect(page).toHaveURL(/import_phase=preview/)
  await expect(
    page
      .locator('.import-preview .el-table')
      .getByText('点一杯咖啡', { exact: true })
      .locator('..')
      .locator('..')
      .locator('input')
  ).toBeDisabled()
})
