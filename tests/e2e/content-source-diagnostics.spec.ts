import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { item, mockWorkOrder, scene } from './fixtures/content-work-orders'

const snapshot = {
  blocks: [
    { id: 'paragraph-0003', text: 'What would you like?', paragraph_index: 3, role: 'english' }
  ],
  workbook: {
    entry_rows: [
      { row_no: 4, values: { english: 'latte', source_sentence: 'What would you drink?' } }
    ]
  }
}
const issue = {
  id: 'source-one',
  code: 'SOURCE_TEXT_CONFLICT',
  message: '来源原句与指定正文位置不一致',
  severity: 'WARNING',
  location: ['source_locator'],
  correction_target: 'source',
  source_diagnostic: {
    entry_id: 'entry-latte',
    entry_type: 'word',
    entry_text: 'latte',
    source_locations: ['原始词条表 · 第 4 行'],
    declared_locator: 1,
    declared_text: 'What would you drink?',
    declared_speaker: 'A',
    actual_sentence_id: 'SENTENCE-1',
    actual_sentence_number: 1,
    actual_text: 'What would you like?',
    actual_speaker: 'A',
    actual_source_locations: ['paragraph-0003'],
    unsupported_fields: [],
    matched_sentence_numbers: []
  }
}
const issues = [
  issue,
  {
    ...issue,
    id: 'source-two',
    source_diagnostic: { ...issue.source_diagnostic, entry_text: 'coffee' }
  }
]

for (const width of [1440, 390]) {
  for (const view of ['import', 'item']) {
    test(`来源诊断定位词条并对照正文 ${view} ${width}px`, async ({ adminApi, page }, testInfo) => {
      expect(adminApi).toBeDefined()
      await mockWorkOrder(page, { template: 'dialogue', content: scene })
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      const preview = {
        work_order_id: 'order',
        batch_id: 'batch',
        status: 'PREVIEW_READY',
        preview_hash: 'a'.repeat(64),
        preview_version: 1,
        batch_issues: [],
        items: [
          {
            item_id: 'one',
            import_item_id: 'import-one',
            import_content_id: 'scene-one',
            row_no: 2,
            operation: 'CREATE',
            status: 'PENDING',
            candidate: scene,
            issues,
            defaults: [],
            resources: {},
            entries: [],
            source_snapshot: snapshot,
            result: null
          }
        ]
      }
      await page.route('**/work-orders/order/import-preview', (route) =>
        route.fulfill({ json: preview })
      )
      await page.route('**/work-orders/order/items/one', (route) =>
        route.fulfill({
          json: {
            ...item,
            issues,
            current: { template: 'dialogue', content: scene },
            source_snapshot: snapshot
          }
        })
      )
      await loginAsAdmin(page)
      await navigateInApp(
        page,
        view === 'import'
          ? '/content/work-orders/order?view=import&import_phase=preview'
          : '/content/work-orders/order/items/one?section=source&issue=source-one'
      )
      if (view === 'import')
        await page.getByText('查看正文、译文、图片角色与音频 · 点一杯咖啡', { exact: true }).click()
      const details = page.getByRole('region', { name: '问题详情', exact: true })
      await expect(details).toHaveCount(1)
      await expect(details).toContainText('2 项问题')
      await expect(
        details.getByRole('heading', {
          name: '词汇「latte」：来源原句与指定正文位置不一致',
          exact: true
        })
      ).toBeVisible()
      await expect(
        details.getByRole('heading', {
          name: '词汇「coffee」：来源原句与指定正文位置不一致',
          exact: true
        })
      ).toBeVisible()
      await expect(details).toContainText('词表填写的来源原句')
      await expect(details).toContainText('指定的正文第 1 句')
      await expect(details).toContainText('重新导入')
      await expect(details.locator('mark').first()).toHaveText('drink')
      await details.getByRole('button', { name: '查看词表位置', exact: true }).first().click()
      await expect(page.locator('[data-source-highlight="true"]')).toContainText('english：latte')
      await details.getByRole('button', { name: '查看对应正文', exact: true }).first().click()
      await expect(page.locator('[data-source-highlight="true"]')).toContainText(
        'What would you like?'
      )
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: testInfo.outputPath(`source-diagnostics-${view}-${width}.png`),
        fullPage: true
      })
      await details.locator('summary').click()
      await expect(
        details.getByRole('heading', {
          name: '词汇「latte」：来源原句与指定正文位置不一致',
          exact: true
        })
      ).not.toBeVisible()
      expect(adminApi.unexpectedRequests).toEqual([])
    })
  }
}

test('旧记录缺少诊断时提供明确处理方法，不猜测位置', async ({ adminApi, page }) => {
  await mockWorkOrder(page)
  await page.route('**/work-orders/order/items/one', (route) =>
    route.fulfill({
      json: { ...item, current: null, issues: [{ ...issue, source_diagnostic: null }] }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one?section=source&issue=source-one')
  const details = page.getByRole('region', { name: '问题详情', exact: true })
  await expect(details).toContainText('旧记录缺少详细定位，请修正源文件后重新导入查看完整诊断')
  await expect(details.getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '补充源文件', exact: true })).toBeVisible()
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('候选正文已修改时不误定位当前句子，仍可定位保留原文', async ({ adminApi, page }) => {
  await mockWorkOrder(page)
  await page.route('**/work-orders/order/items/one', (route) =>
    route.fulfill({
      json: {
        ...item,
        current: {
          template: 'dialogue',
          content: { ...scene, dialogue: [{ ...scene.dialogue[0], english: 'Edited candidate.' }] }
        },
        source_snapshot: snapshot,
        issues: [issue]
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one?section=source')
  const details = page.getByRole('region', { name: '问题详情', exact: true })
  await expect(details.getByRole('button', { name: '查看对应正文', exact: true })).toHaveCount(0)
  await details.getByRole('button', { name: '查看原文对应段落', exact: true }).click()
  await expect(page.locator('[data-source-highlight="true"]')).toContainText('What would you like?')
  await expect(page.locator('[data-source-highlight="true"]')).toContainText('第 3 段')
  await details.getByRole('button', { name: '核对本篇词条', exact: true }).click()
  await expect(page).toHaveURL(/section=entries/)
  await expect(details.getByRole('button', { name: '查看词表位置', exact: true })).toHaveCount(0)
  await expect(details.getByRole('button', { name: '查看原文对应段落', exact: true })).toHaveCount(
    0
  )
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('未保存草稿的 Word 表格问题能定位真实单元格并说明补充源文件', async ({ adminApi, page }) => {
  await mockWorkOrder(page)
  const cellId = 'table-0001-row-0004-cell-0001'
  const wordSnapshot = {
    blocks: [
      snapshot.blocks[0],
      {
        id: cellId,
        kind: 'table_cell',
        table_index: 1,
        row_index: 4,
        column_index: 1,
        children: [
          {
            id: `${cellId}-paragraph-0001`,
            kind: 'paragraph',
            paragraph_index: 1,
            text: 'latte · What would you drink?'
          },
          {
            id: `${cellId}-paragraph-0002`,
            kind: 'paragraph',
            paragraph_index: 2,
            text: 'Additional table evidence.'
          }
        ]
      }
    ]
  }
  await page.route('**/work-orders/order/items/one', (route) =>
    route.fulfill({
      json: {
        ...item,
        current: null,
        source_snapshot: wordSnapshot,
        issues: [
          {
            ...issue,
            source_diagnostic: { ...issue.source_diagnostic, source_locations: [cellId] }
          }
        ]
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one?section=source&issue=source-one')
  const details = page.getByRole('region', { name: '问题详情', exact: true })
  await expect(details).toContainText('表 1 · 第 4 行 · 第 1 列')
  await expect(details).toContainText('在源文件中修正有误的一项，再重新导入')
  await expect(details.getByRole('button', { name: '核对本篇词条', exact: true })).toHaveCount(0)
  await details.getByRole('button', { name: '查看词表位置', exact: true }).click()
  await expect(page.locator('[data-source-highlight="true"]')).toContainText(
    'latte · What would you drink?'
  )
  await expect(page.getByRole('button', { name: '补充源文件', exact: true })).toBeVisible()
  expect(adminApi.unexpectedRequests).toEqual([])
})
