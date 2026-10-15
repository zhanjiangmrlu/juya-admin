import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { mockWorkOrder, reading } from './fixtures/content-work-orders'

for (const width of [1440, 390]) {
  test(`保存前确认与禁用原因在底栏可见，原校验与提交保持一致 ${width}px`, async ({
    adminApi,
    page
  }, testInfo) => {
    expect(adminApi).toBeDefined()
    await mockWorkOrder(page)
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    const preview = {
      work_order_id: 'order',
      batch_id: 'batch',
      status: 'PREVIEW_READY',
      preview_hash: 'a'.repeat(64),
      preview_version: 1,
      batch_issues: [],
      unreferenced_files: [],
      items: [
        {
          item_id: 'one',
          import_item_id: 'import-one',
          import_content_id: 'source-one',
          row_no: 2,
          operation: 'CREATE',
          status: 'PENDING',
          candidate: { ...reading, title_zh: '跨大陆地理考察' },
          issues: [
            {
              id: 'difference',
              code: 'SOURCE_SENTENCE_MISMATCH',
              message: '来源原句与指定正文位置不一致',
              location: ['source_sentence'],
              correction_target: 'source',
              severity: 'WARNING'
            }
          ],
          defaults: ['default_cover'],
          resources: {},
          entries: [],
          source_snapshot: { blocks: [{ text: 'The original English paragraph.' }] },
          result: null
        }
      ]
    }
    await page.route('**/work-orders/order/import-preview', (route) =>
      route.fulfill({ json: preview })
    )
    let confirmation: unknown = null
    await page.route('**/work-orders/order/import-confirm', async (route) => {
      confirmation = route.request().postDataJSON()
      await route.fulfill({
        json: { command_id: 'confirmed', work_order_id: 'order', version: 1, status: 'QUEUED' }
      })
    })
    await loginAsAdmin(page)
    await navigateInApp(page, '/content/work-orders/order?view=import&import_phase=preview')
    const review = page.getByRole('region', { name: '保存前确认', exact: true })
    await expect(review.getByRole('status')).toContainText('请先在上方表格选择需要保存的篇目')
    await page.locator('.el-table').getByText('跨大陆地理考察', { exact: true }).click()
    const save = review.getByRole('button', { name: '确认保存选中 1 篇草稿', exact: true })
    await expect(save).toBeDisabled()
    await expect(review.getByRole('status')).toContainText('尚未确认原文与表格差异')
    await expect(review.getByRole('status')).toContainText('确认使用默认封面')
    await page.getByText('查看正文、译文、图片角色与音频 · 跨大陆地理考察', { exact: true }).click()
    await page.getByText('确认使用默认封面', { exact: true }).click()
    await expect(save).toBeDisabled()
    const difference = review.getByText(
      '已核对原文与表格的差异，按预览值保存；阻断问题仍需补充源文件',
      { exact: true }
    )
    await expect(difference).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    const saveBounds = await save.boundingBox()
    const differenceBounds = await difference.boundingBox()
    expect(saveBounds!.y + saveBounds!.height).toBeLessThanOrEqual(width === 390 ? 844 : 900)
    expect(Math.abs(saveBounds!.y - differenceBounds!.y)).toBeLessThan(240)
    await page.screenshot({
      path: testInfo.outputPath(`import-save-confirmation-${width}.png`),
      fullPage: true
    })
    await difference.click()
    await expect(save).toBeEnabled()
    await expect(review.getByRole('status')).toHaveCount(0)
    await save.click()
    await expect
      .poll(() => confirmation)
      .toMatchObject({
        expected_version: 1,
        scope: 'selected',
        selected_item_ids: ['one'],
        preview_hash: 'a'.repeat(64),
        preview_version: 1,
        acknowledged_defaults: ['default_cover'],
        confirmed_conflicts: ['import-one:source_sentence']
      })
  })
}
