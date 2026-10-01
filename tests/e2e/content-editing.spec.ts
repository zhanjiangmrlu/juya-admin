import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('新建系列与场景网络失败重试复用各自幂等键，关闭后使用新键', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes')
  const seriesKeys: string[] = []
  const sceneKeys: string[] = []
  await page.route('**/api/v1/admin/content/series', async (route) => {
    if (route.request().method() === 'POST') {
      seriesKeys.push(route.request().headers()['x-idempotency-key'] ?? '')
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
  await page.getByRole('button', { name: '新建场景', exact: true }).click()
  await page.getByLabel('系列名称', { exact: true }).fill('Retry series')
  await page.getByLabel('系列标识', { exact: true }).fill('retry-series')
  const createSeries = page.getByRole('button', { name: '创建系列', exact: true })
  await createSeries.click()
  await expect.poll(() => seriesKeys.length).toBe(1)
  await expect(createSeries).toBeEnabled()
  await createSeries.click()
  await expect(page.getByLabel('系列名称', { exact: true })).toHaveValue('')
  expect(seriesKeys[0]).toBeTruthy()
  expect(seriesKeys[1]).toBe(seriesKeys[0])
  await page.getByLabel('系列名称', { exact: true }).fill('Another series')
  await page.getByLabel('系列标识', { exact: true }).fill('another-series')
  await createSeries.click()
  await expect.poll(() => seriesKeys.length).toBe(3)
  await expect(createSeries).toBeEnabled()
  expect(seriesKeys[2]).not.toBe(seriesKeys[1])
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '新建场景', exact: true }).click()
  await createSeries.click()
  await expect(page.getByLabel('系列名称', { exact: true })).toHaveValue('')
  expect(seriesKeys[3]).not.toBe(seriesKeys[2])
  const createScene = page.getByRole('button', { name: '创建并编辑', exact: true })
  await createScene.click()
  await expect.poll(() => sceneKeys.length).toBe(1)
  await expect(createScene).toBeEnabled()
  await createScene.click()
  await expect(page).toHaveURL(/\/content\/scenes\/[^/]+\/edit$/)
  expect(sceneKeys[0]).toBeTruthy()
  expect(sceneKeys[1]).toBe(sceneKeys[0])
  expect(sceneKeys[0]).not.toBe(seriesKeys[3])
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('保存响应待返回时锁定基础表单和子组件，完成后恢复编辑', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit')
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
  const sentence = page.getByLabel('英文句子 1', { exact: true })
  const word = page.getByLabel('vocabulary 英文 1', { exact: true })
  await title.fill('Pending save title')
  await sentence.fill('Saved sentence.')
  await word.fill('latte')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await saveEntered
  try {
    await expect(title).toBeDisabled()
    await expect(sentence).toBeDisabled()
    await expect(word).toBeDisabled()
    await expect(page.getByRole('button', { name: '添加句子', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '添加词汇', exact: true })).toBeDisabled()
  } finally {
    releaseSave()
  }
  await expect(page.getByText('草稿已保存')).toBeVisible()
  await expect(title).toBeEnabled()
  await expect(sentence).toBeEnabled()
  await expect(word).toBeEnabled()
  await expect(title).toHaveValue('Pending save title')
  await expect(sentence).toHaveValue('Saved sentence.')
  await expect(word).toHaveValue('latte')
  await title.fill('Continue editing')
  await expect(title).toHaveValue('Continue editing')
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('结构化表单保留稳定编号并保存词汇语块和双语字段', async ({ adminApi, page }, testInfo) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit')
  await page.getByLabel('英文句子 1', { exact: true }).fill('A latte, please.')
  await page.getByLabel('封面素材编号', { exact: true }).fill('old-cover')
  await page.getByLabel('封面素材编号', { exact: true }).fill('')
  await page.getByLabel('中文翻译 1', { exact: true }).fill('请来一杯拿铁。')
  await page.getByRole('button', { name: '添加句子', exact: true }).click()
  await page.getByLabel('英文句子 2', { exact: true }).fill('Here you go.')
  await page.getByLabel('中文翻译 2', { exact: true }).fill('给您。')
  await page.getByRole('button', { name: '添加语块', exact: true }).click()
  await page.getByLabel('chunk 英文 1', { exact: true }).fill('here you go')
  await page.getByLabel('chunk 中文 1', { exact: true }).fill('给您')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
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
  await page.getByRole('button', { name: '设备预览', exact: true }).click()
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

  await expect(page.getByText('Ordering coffee', { exact: true })).toBeVisible()
  await expect(page.getByText('日常英语')).toBeVisible()
  await page.setViewportSize({ height: 900, width: 1440 })
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('content-list-1440x900.png') })
  await page.setViewportSize({ height: 800, width: 1280 })
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('content-list-1280x800.png') })

  expect(adminApi.findRequest('GET', '/api/v1/admin/content/scenes')).toBeTruthy()
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('草稿保存冲突保留本地输入，并明确展示远端版本', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  adminApi.conflictOnNextRevisionSave()
  await navigateInApp(page, '/content/scenes/SCENE-1/edit')

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
  await navigateInApp(page, '/content/discovery-config')

  const firstOpenScene = page.getByLabel('开放场景 1')
  await expect(firstOpenScene).toHaveValue('SCENE-1')
  await firstOpenScene.fill('SCENE-LOCAL')
  await page.getByRole('button', { name: '保存全部配置' }).click()

  await expect(page.getByText(/远端已更新到 v4/)).toBeVisible()
  await expect(firstOpenScene).toHaveValue('SCENE-LOCAL')
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
