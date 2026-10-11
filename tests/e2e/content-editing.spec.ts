import type { Page } from '@playwright/test'

import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

/** 切换同一草稿的内容工作区
 * @param page - 当前管理页面
 * @param label - 工作区名称
 */
const switchArea = async (page: Page, label: string): Promise<void> => {
  await page.getByRole('combobox', { name: '切换内容工作区', exact: true }).press('Enter')
  await page.getByRole('option', { name: label, exact: true }).click()
}

test('新建系列与场景网络失败重试复用各自幂等键，关闭后使用新键', async ({ adminApi, page }) => {
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
  await page.route('**/api/v1/admin/content/scenes', async (route) => {
    if (route.request().method() === 'POST') {
      sceneKeys.push(route.request().headers()['x-idempotency-key'] ?? '')
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
  await expect(page).toHaveURL(/\/content\/scenes\/[^/]+\/edit\?stage=draft$/)
  expect(sceneKeys[0]).toBeTruthy()
  expect(sceneKeys[1]).toBe(sceneKeys[0])
  expect(sceneKeys[0]).not.toBe(seriesKeys[3])
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('保存响应待返回时锁定基础表单和子组件，完成后恢复编辑', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=draft')
  let releaseSave!: () => void
  let enteredSave!: () => void
  const pendingSave = new Promise<void>((resolve) => {
    releaseSave = resolve
  })
  const saveEntered = new Promise<void>((resolve) => {
    enteredSave = resolve
  })
  await page.route('**/api/v1/admin/content/revisions/REV-DRAFT-1', async (route) => {
    if (route.request().method() === 'PUT') {
      enteredSave()
      await pendingSave
    }
    await route.fallback()
  })
  const title = page.getByLabel('英文标题', { exact: true })
  await title.fill('Pending save title')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await saveEntered
  try {
    await expect(title).toBeDisabled()
    await expect(page.getByRole('combobox', { name: '切换内容工作区', exact: true })).toBeDisabled()
  } finally {
    releaseSave()
  }
  await expect(page.getByText('草稿已保存')).toBeVisible()
  await expect(title).toBeEnabled()
  await switchArea(page, '正文对照与配对校对')
  await expect(page.getByLabel('英文句子 1', { exact: true })).toBeEnabled()
  await switchArea(page, '本篇词汇与语块')
  await page.locator('.entries-grid').getByText('编辑文字资料', { exact: true }).first().click()
  await expect(page.getByLabel('vocabulary 英文 1', { exact: true })).toBeEnabled()
  await switchArea(page, '场景结构化编辑')
  await expect(title).toHaveValue('Pending save title')
  await title.fill('Continue editing')
  await expect(title).toHaveValue('Continue editing')
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('结构化表单保留稳定编号并保存词汇语块和双语字段', async ({ adminApi, page }, testInfo) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=draft')
  await page.getByLabel('封面素材编号', { exact: true }).fill('old-cover')
  await page.getByLabel('封面素材编号', { exact: true }).fill('')
  await switchArea(page, '正文对照与配对校对')
  await page.getByLabel('英文句子 1', { exact: true }).fill('A latte, please.')
  await page.getByLabel('中文翻译 1', { exact: true }).fill('请来一杯拿铁。')
  await page.getByRole('button', { name: '添加句子', exact: true }).click()
  await page.getByLabel('英文句子 2', { exact: true }).fill('Here you go.')
  await page.getByLabel('中文翻译 2', { exact: true }).fill('给您。')
  await switchArea(page, '本篇词汇与语块')
  await page.getByRole('button', { name: '添加语块', exact: true }).click()
  await page.locator('.entries-grid').getByText('编辑文字资料', { exact: true }).last().click()
  await page.getByLabel('chunk 英文 1', { exact: true }).fill('here you go')
  await page.getByLabel('chunk 中文 1', { exact: true }).fill('给您')
  await page.getByRole('button', { name: '保存候选资料', exact: true }).click()
  await expect(page.getByText('草稿已保存')).toBeVisible()
  const request = adminApi.findRequest('PUT', '/api/v1/admin/content/revisions/REV-DRAFT-1')
  expect(request?.body).toMatchObject({
    expected_version: 3,
    content: {
      title_en: 'Ordering coffee',
      title_zh: '点一杯咖啡',
      cover_asset_id: null,
      dialogue: [
        {
          id: 'SENTENCE-1',
          english: 'A latte, please.',
          chinese: '请来一杯拿铁。',
          timing_confirmed: false
        },
        { english: 'Here you go.' }
      ],
      chunks: [{ english: 'here you go' }]
    }
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('scene-editor-1440x900.png') })
  await page.getByRole('button', { name: '手机 / 平板预览', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '场景设备预览' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ordering coffee', exact: true })).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('scene-phone-preview.png')
  })
  await page.getByText('平板预览', { exact: true }).click()
  await expect(page.locator('.device-frame')).toHaveClass(/tablet/)
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('scene-tablet-preview.png')
  })
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('内容目录加载真实分页，并在两个目标视口保持可操作', async ({ adminApi, page }, testInfo) => {
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

test('草稿保存冲突保留本地输入，并明确展示远端版本', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  adminApi.conflictOnNextRevisionSave()
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=draft')

  const title = page.getByLabel('英文标题', { exact: true })
  await expect(title).toHaveValue('Ordering coffee')
  await title.fill('本地仍需保留的标题')
  await page.getByRole('button', { name: '保存草稿' }).click()

  await expect(page.getByText(/远端已更新到 v4/)).toBeVisible()
  await expect(title).toBeEnabled()
  await expect(title).toHaveValue('本地仍需保留的标题')
  const request = adminApi.findRequest('PUT', '/api/v1/admin/content/revisions/REV-DRAFT-1')
  expect(request?.body).toMatchObject({ expected_version: 3 })
  expect(request?.headers['x-csrf-token']).toBe('csrf-e2e')
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

test('管理员预览直接展示草稿内容且不触发发布副作用', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/REV-DRAFT-1/publish')

  await expect(page.getByRole('heading', { name: 'Ordering coffee' })).toBeVisible()
  await expect(page.getByText('咖啡店点单练习', { exact: true })).toBeVisible()
  expect(
    adminApi.findRequest('GET', '/api/v1/admin/content/revisions/REV-DRAFT-1/preview')
  ).toBeTruthy()
  expect(
    adminApi.findRequest('POST', '/api/v1/admin/content/revisions/REV-DRAFT-1/commands/publish')
  ).toBeUndefined()
  expect(adminApi.unexpectedRequests).toEqual([])
})
