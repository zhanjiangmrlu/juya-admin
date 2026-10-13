import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { mockWorkOrder, scene } from './fixtures/content-work-orders'

test('保存响应待返回时锁定修正表单和子组件，完成后恢复编辑', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  await mockWorkOrder(page, { template: 'dialogue', content: scene })
  let release!: () => void
  let entered = false
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/work-orders/order/items/one/correction', async (route) => {
    entered = true
    await pending
    await route.fallback()
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  const title = page.getByLabel('英文标题', { exact: true })
  await title.fill('Pending save title')
  await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
  await expect.poll(() => entered).toBe(true)
  try {
    await expect(title).toBeDisabled()
    await expect(page.getByLabel('英文句子 1', { exact: true })).toBeDisabled()
  } finally {
    release()
  }
  await expect(title).toBeEnabled()
  await expect(title).toHaveValue('Pending save title')
})

test('结构化修正保存稳定句子身份与双语词汇语块并重读绑定', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const requests = await mockWorkOrder(page, { template: 'dialogue', content: scene })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  await page.getByLabel('英文句子 1', { exact: true }).fill('A latte, please.')
  await page.getByLabel('中文翻译 1', { exact: true }).fill('请来一杯拿铁。')
  await page.getByRole('button', { name: '添加句子', exact: true }).click()
  await page.getByLabel('英文句子 2', { exact: true }).fill('Here you go.')
  await page.getByLabel('中文翻译 2', { exact: true }).fill('给您。')
  await page.getByRole('button', { name: '添加语块', exact: true }).click()
  await page.getByLabel('chunk 英文 1', { exact: true }).fill('here you go')
  await page.getByLabel('chunk 中文 1', { exact: true }).fill('给您')
  await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
  await expect.poll(() => requests.filter((row) => row.path.endsWith('/correction')).length).toBe(1)
  expect(requests.find((row) => row.path.endsWith('/correction'))?.body).toMatchObject({
    expected_edit_version: 1,
    current: {
      content: {
        cover_asset_id: null,
        dialogue: [
          { id: 'SENTENCE-1', english: 'A latte, please.', chinese: '请来一杯拿铁。' },
          { english: 'Here you go.' }
        ],
        vocabulary: [{ entry_id: 'local-latte' }],
        chunks: [{ english: 'here you go' }]
      }
    }
  })
  await expect
    .poll(() => requests.filter((row) => row.path.endsWith('/entry-bindings')).length)
    .toBeGreaterThan(1)
})

test('工作单场景设备预览不触发发布且支持手机和平板', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(
    page,
    '/content/scenes/SCENE-1/edit?stage=audio&work_order_id=order&work_item_id=one'
  )
  await page.getByRole('button', { name: '手机 / 平板预览', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '场景设备预览' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ordering coffee', exact: true })).toBeVisible()
  await page.getByText('平板预览', { exact: true }).click()
  await expect(page.locator('.device-frame')).toHaveClass(/tablet/)
  expect(adminApi.requests.some((row) => row.pathname.endsWith('/commands/publish'))).toBe(false)
})

test('新建系列与场景网络失败重试复用各自幂等键，关闭后使用新键', async ({ adminApi, page }) => {
  await mockWorkOrder(page, { template: 'dialogue', content: scene })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes')
  const seriesKeys: string[] = []
  const seriesSlugs: string[] = []
  const sceneKeys: string[] = []
  await page.route('**/api/v1/admin/content/series', async (route) => {
    if (route.request().method() === 'POST') {
      seriesKeys.push(route.request().headers()['x-idempotency-key'] ?? '')
      seriesSlugs.push((route.request().postDataJSON() as { slug: string }).slug)
      if (seriesKeys.length === 1 || seriesKeys.length === 3) return route.abort('failed')
    }
    await route.fallback()
  })
  await page.route('**/api/v1/admin/content-production/work-orders/manual', async (route) => {
    if (route.request().method() === 'POST') {
      sceneKeys.push(route.request().headers()['idempotency-key'] ?? '')
      if (sceneKeys.length === 1) return route.abort('failed')
    }
    await route.fallback()
  })
  await page.getByRole('button', { name: '单篇新建', exact: true }).click()
  await page.getByText('创建新分类', { exact: true }).click()
  await page.getByLabel('系列名称', { exact: true }).fill('Retry series')
  const createSeries = page.getByRole('button', { name: '创建系列', exact: true })
  await createSeries.click()
  await expect.poll(() => seriesKeys.length).toBe(1)
  await expect(createSeries).toBeEnabled()
  await createSeries.click()
  await expect(page.getByLabel('系列名称', { exact: true })).toHaveValue('')
  expect(seriesKeys[0]).toBeTruthy()
  expect(seriesKeys[1]).toBe(seriesKeys[0])
  expect(seriesSlugs[1]).toBe(seriesSlugs[0])
  expect(seriesSlugs[0]).toBeTruthy()
  await page.getByLabel('系列名称', { exact: true }).fill('Another series')
  await createSeries.click()
  await expect.poll(() => seriesKeys.length).toBe(3)
  await expect(createSeries).toBeEnabled()
  expect(seriesKeys[2]).not.toBe(seriesKeys[1])
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '单篇新建', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '单篇新建', exact: true })).toBeVisible()
  if (
    (await page
      .getByRole('dialog', { name: '单篇新建', exact: true })
      .locator('details')
      .getAttribute('open')) === null
  )
    await page.getByText('创建新分类', { exact: true }).click()
  await page.getByLabel('系列名称', { exact: true }).fill('Reopened series')
  await createSeries.click()
  await expect(page.getByLabel('系列名称', { exact: true })).toHaveValue('')
  expect(seriesKeys[3]).not.toBe(seriesKeys[2])
  expect(seriesSlugs[3]).not.toBe(seriesSlugs[2])
  const createScene = page.getByRole('button', { name: '创建并编辑', exact: true })
  await createScene.click()
  await expect.poll(() => sceneKeys.length).toBe(1)
  await expect(createScene).toBeEnabled()
  await createScene.click()
  await expect(page).toHaveURL(/\/content\/work-orders\/order\/items\/one$/)
  expect(sceneKeys[0]).toBeTruthy()
  expect(sceneKeys[1]).toBe(sceneKeys[0])
  expect(sceneKeys[0]).not.toBe(seriesKeys[3])
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('内容目录加载真实分页，并在两个目标视口保持可操作', async ({ adminApi, page }, testInfo) => {
  await mockWorkOrder(page)
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes')

  await expect(page.getByRole('cell', { name: /Ordering coffee.*咖啡店点单/ })).toBeVisible()
  await expect(page.getByText('日常英语')).toBeVisible()
  await page.setViewportSize({ height: 900, width: 1440 })
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('content-list-1440x900.png') })
  await page.setViewportSize({ height: 800, width: 1280 })
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('content-list-1280x800.png') })

  expect(adminApi.findRequest('GET', '/api/v1/admin/content/catalogue')).toBeTruthy()
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('发现页配置恢复真实快照，冲突时不覆盖本地表单', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  adminApi.conflictOnNextDiscoverySave()
  await page.route('**/api/v1/admin/content/scenes?**', async (route) => {
    await route.fulfill({
      json: {
        items: Array.from({ length: 7 }, (_, index) => ({
          id: `SCENE-${index + 1}`,
          title: index === 0 ? 'Ordering coffee' : `Published scene ${index + 1}`,
          series_id: 'SERIES-1',
          series_title: '日常英语',
          status: 'PUBLISHED',
          summary: '',
          cover_object_key: null,
          draft_revision_id: null,
          published_revision_id: `PUBLISHED-${index + 1}`,
          updated_at: '2026-10-11T00:00:00Z'
        })),
        total: 7,
        page: 1,
        page_size: 100
      }
    })
  })
  await navigateInApp(page, '/content/discovery-config')

  const firstOpenScene = page.getByRole('combobox', { name: '开放场景 1', exact: true })
  await expect(
    firstOpenScene.locator(
      'xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," el-select ")][1]'
    )
  ).toContainText('Ordering coffee')
  await firstOpenScene.press('Enter')
  await page.getByRole('option', { name: 'Published scene 7', exact: true }).first().click()
  await page.getByRole('button', { name: '保存配置' }).click()

  await expect(
    page.getByText('配置已变化，本地输入已保留。请重新读取后核对。', { exact: true })
  ).toBeVisible()
  await expect(
    firstOpenScene.locator(
      'xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," el-select ")][1]'
    )
  ).toContainText('Published scene 7')
  expect(adminApi.findRequest('PUT', '/api/v1/admin/content/discovery-config')?.body).toMatchObject(
    {
      expected_version: 3,
      open_scene_ids: ['SCENE-7', 'SCENE-2', 'SCENE-3']
    }
  )
  expect(adminApi.unexpectedRequests).toEqual([])
})
