import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

const imported = {
  batch_id: 'IMPORT-FOUNDATION',
  status: 'PREVIEW_READY',
  items: [
    {
      item_id: 'IM-1',
      status: 'SUCCESS',
      import_content_id: 'station',
      candidate: { title_en: 'At the Station' },
      issues: [],
      result: { content_id: 'SCENE-1', revision_id: 'REV-1' }
    },
    {
      item_id: 'IM-2',
      status: 'PENDING',
      import_content_id: 'favor',
      candidate: { title_en: 'A Small Favor' },
      issues: [
        {
          severity: 'ERROR',
          code: 'MISSING_TRANSLATION',
          field: '第2段中文',
          message: '完整中文译文缺失'
        }
      ],
      result: {}
    },
    {
      item_id: 'IM-3',
      status: 'FAILED',
      import_content_id: 'audio',
      candidate: { title_en: 'Weekend Plans' },
      issues: [],
      result: { error_code: 'AUDIO_FAILED', stage: 'ASR_ALIGN' }
    }
  ]
}

test('新版工作台六张卡与底栏按钮，并恢复导入结果与逐篇问题', async ({
  adminApi,
  page
}, testInfo) => {
  void adminApi
  let cancelled = false
  await page.route('**/api/v1/admin/content-imports/IMPORT-FOUNDATION**', async (route) => {
    if (route.request().url().endsWith('/cancel')) {
      cancelled = true
      return route.fulfill({ json: { batch_id: imported.batch_id, status: 'CANCELLED' } })
    }
    return route.fulfill({
      json: { ...imported, status: cancelled ? 'CANCELLED' : imported.status }
    })
  })
  await loginAsAdmin(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('.dashboard-page .metric')).toHaveCount(6)
  await expect(page.getByRole('button', { name: '批量导入内容' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('A01-1440.png') })
  await navigateInApp(page, '/content/jobs?batch_id=IMPORT-FOUNDATION')
  await expect(page.locator('.import-overview .metric')).toHaveCount(4)
  await expect(page.getByText('3篇已解析')).toBeVisible()
  await expect(page.getByText('当前接口尚未返回本批')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('A24-1440.png') })
  await page.getByRole('button', { name: '查看整理结果' }).click()
  await expect(page.getByText('完整中文译文缺失')).toBeVisible()
  await expect(page.getByText('AUDIO_FAILED')).toBeVisible()
  await page
    .locator('label')
    .filter({ hasText: /^处理失败$/ })
    .click()
  await expect(page.getByText('完整中文译文缺失')).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath('A20-1440.png') })
  await page.getByRole('button', { name: '返回批量任务' }).click()
  await page.getByRole('button', { name: '取消未开始项目', exact: true }).click()
  await expect(page.getByRole('button', { name: '取消未开始项目', exact: true })).toBeDisabled()
  expect(cancelled).toBe(true)
  await navigateInApp(page, '/dashboard')
  await navigateInApp(page, '/content/jobs?batch_id=IMPORT-FOUNDATION')
  await expect(page.getByText('3篇已解析')).toBeVisible()
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
    { width: 760, height: 850 }
  ]) {
    await page.setViewportSize(viewport)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await expect(page.getByRole('button', { name: '查看失败阶段' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`A24-${viewport.width}.png`) })
  }
})

test('基础用户、联系、消息、统计与登录路由可读且无横向溢出', async ({
  adminApi,
  page
}, testInfo) => {
  void adminApi
  await page.route('**/api/v1/admin/content/usage?**', (route) =>
    route.fulfill({
      json: {
        period: '2026-10-11',
        measured_cloud: [
          {
            kind: 'AI_TOKENS',
            attempts: 1,
            reserved_units: 1000,
            actual_units: 400,
            unknown_attempts: 0
          }
        ],
        tts: { attempts: 0, actual_characters: null },
        import_batches: [{ status: 'PREVIEW_READY', count: 2 }]
      }
    })
  )
  await loginAsAdmin(page)
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 }
  ]) {
    await page.setViewportSize(viewport)
    for (const [id, path, selector] of [
      ['A02', '/users?page=1&page_size=10', '.user-list-page'],
      ['A03', '/users/USER-1', '.user-detail-page'],
      ['A04', '/contacts/corrections/COR-1', '.contact-correction-page'],
      ['A13', '/work-items', '.work-item-page'],
      ['A25', '/analytics', '.analytics-page']
    ]) {
      await navigateInApp(page, path!)
      await expect(page.locator(selector!)).toBeVisible()
      if (id === 'A25') await expect(page.getByText('400 token', { exact: true })).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      await page.screenshot({ path: testInfo.outputPath(`${id}-${viewport.width}.png`) })
    }
  }
  expect(adminApi.unexpectedRequests).toEqual([])
})
