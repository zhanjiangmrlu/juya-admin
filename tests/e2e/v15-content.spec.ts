import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

const batch = {
  batch_id: 'IMPORT-1',
  status: 'PREVIEW_READY',
  preview_version: 1,
  preview_hash: 'a'.repeat(64),
  manifest: { content_type: 'dialogue', unreferenced_files: ['orphan.png'] },
  items: [
    {
      item_id: 'ITEM-OK',
      row_no: 2,
      import_content_id: 'external-good',
      candidate: {
        content_type: 'dialogue',
        title_en: 'A complete import',
        title_zh: '完整导入测试',
        dialogue: [
          {
            speaker: 'A',
            english: 'Hello, this is the complete English line.',
            chinese: '你好，这是完整的中文句子。'
          }
        ]
      },
      resources: {},
      entries: [],
      issues: [],
      defaults: ['default_cover'],
      operation: 'CREATE',
      mapping: null,
      status: 'PENDING',
      result: {}
    },
    {
      item_id: 'ITEM-BAD',
      row_no: 3,
      import_content_id: 'external-bad',
      candidate: { title_en: 'Invalid item', title_zh: '错误内容' },
      resources: {},
      entries: [],
      issues: [
        {
          code: 'IMPORT_BINDING_PATH_MISSING',
          field: 'cover_path',
          message: '封面路径不存在，请修正或排除',
          severity: 'ERROR'
        }
      ],
      defaults: [],
      operation: 'CREATE',
      mapping: null,
      status: 'PENDING',
      result: {}
    }
  ]
}

test('ZIP逐行排除、缺省确认与明确哈希范围提交', async ({ adminApi, page }) => {
  let confirmation: unknown = null
  let key = ''
  await page.route('**/api/v1/admin/content-imports**', async (route) => {
    if (route.request().method() === 'POST' && route.request().url().endsWith('/confirm')) {
      confirmation = route.request().postDataJSON()
      key = route.request().headers()['idempotency-key'] || ''
      return route.fulfill({ json: { batch_id: 'IMPORT-1', status: 'PENDING' } })
    }
    return route.fulfill({ json: batch })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import?batch_id=IMPORT-1')
  await expect(page.getByText('封面路径不存在，请修正或排除')).toBeVisible()
  const next = page.getByRole('button', { name: '查看对应关系与差异', exact: true })
  await expect(next).toBeDisabled()
  await page
    .locator('.el-table__row')
    .filter({ hasText: '错误内容' })
    .locator('.el-checkbox')
    .click()
  await next.click()
  await expect(page.getByText('Hello, this is the complete English line.')).toBeVisible()
  await expect(page.getByText('你好，这是完整的中文句子。')).toBeVisible()
  await page.locator('.binding-preview .el-checkbox').filter({ hasText: '选中这篇' }).click()
  const submit = page.getByRole('button', { name: '确认保存选中 1 篇草稿', exact: true })
  await expect(submit).toBeDisabled()
  await page
    .locator('.binding-preview .el-checkbox')
    .filter({ hasText: '确认使用默认封面' })
    .click()
  await submit.click()
  expect(confirmation).toEqual({
    preview_hash: 'a'.repeat(64),
    preview_version: 1,
    selected: ['ITEM-OK'],
    acknowledged_defaults: ['default_cover'],
    confirmed_conflicts: []
  })
  expect(key).toMatch(/^idem-/)
  await expect(page.getByRole('heading', { name: '草稿保存结果', exact: true })).toBeVisible()
  expect(adminApi.requests.some((request) => request.pathname.includes('/commands/publish'))).toBe(
    false
  )
})

for (const width of [1280, 1440, 1920, 390]) {
  test(`V1.5 导入和抽样界面 ${width}px 无横向溢出`, async ({ adminApi, page }, testInfo) => {
    await loginAsAdmin(page)
    await page.setViewportSize({
      width,
      height: width === 390 ? 844 : width === 1280 ? 800 : width === 1920 ? 1080 : 900
    })
    for (const path of ['/content/import', '/content/proofreading']) {
      await navigateInApp(page, path)
      await expect(
        page.getByRole('heading', {
          level: path === '/content/import' ? 3 : 2,
          name: path === '/content/import' ? '上传统一内容包' : '内容抽样校对',
          exact: true
        })
      ).toBeVisible()
      if (width === 390) {
        await expect(page.locator('.aside.collapsed .el-menu--collapse')).toBeVisible()
        await expect(page.locator('.aside .section-label')).toHaveCount(0)
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      ).toBeLessThanOrEqual(1)
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`v15-${path.split('/').at(-1)}-${width}.png`),
        fullPage: true
      })
    }
    expect(adminApi.unexpectedRequests).toEqual([])
  })
}
