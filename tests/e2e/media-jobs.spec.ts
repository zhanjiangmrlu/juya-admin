import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('OCR 设置带幂等头，失败重试复用键，成功或输入变化后使用新键', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import')
  const keys: Array<string | undefined> = []
  await page.route('**/api/v1/admin/media/ocr/settings', async (route) => {
    const key = route.request().headers()['x-idempotency-key']
    keys.push(key)
    const unavailable = keys.length === 1 || keys.length === 3
    await route.fulfill({
      status: !key ? 422 : unavailable ? 503 : 200,
      json: !key
        ? {
            code: 'VALIDATION_ERROR',
            message: '缺少 X-Idempotency-Key',
            request_id: 'settings-e2e'
          }
        : unavailable
          ? { code: 'UNAVAILABLE', message: '设置保存暂不可用', request_id: 'settings-e2e' }
          : { ...route.request().postDataJSON(), remaining: 100 }
    })
  })
  const save = page.getByRole('button', { name: '保存 OCR 设置' })
  await save.click()
  await expect.poll(() => keys.length).toBe(1)
  expect(keys[0]).toBeTruthy()
  await expect(page.getByText('设置保存暂不可用', { exact: true })).toBeVisible()
  await save.click()
  await expect(page.getByText('OCR 设置已保存', { exact: true })).toBeVisible()
  expect(keys[1]).toBe(keys[0])

  await save.click()
  await expect.poll(() => keys.length).toBe(3)
  expect(keys[2]).not.toBe(keys[1])
  await expect(save).toBeEnabled()
  await page.getByLabel('内部月额度').fill('20')
  await save.click()
  await expect.poll(() => keys.length).toBe(4)
  expect(keys[3]).not.toBe(keys[2])
  await expect(page.getByText('内部月额度为 0 时不会发起识别，不代表不限量。')).toBeVisible()
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('图片确认只上传素材并提供场景录入入口', async ({ adminApi, page }) => {
  await page.route('**/__e2e-upload', async (route) => route.fulfill({ status: 204 }))
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import')
  await page.getByLabel('系列编号').press('Enter')
  await page.getByRole('option', { name: '日常英语' }).click()
  await page.getByLabel('识别模板').press('Enter')
  await page.getByRole('option', { name: '对话', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from('e2e-image'),
    mimeType: 'image/png',
    name: 'scene.png'
  })
  await page.getByRole('button', { name: '开始上传' }).click()

  await expect(page.getByRole('button', { name: '编辑场景草稿' })).toBeVisible()
  expect(adminApi.findRequest('POST', '/api/v1/admin/content/imports')?.body).toEqual({
    asset_ids: ['ASSET-UPLOADED-1'],
    series_id: 'SERIES-1',
    template_type: 'dialogue'
  })
  await page.getByRole('button', { name: '编辑场景草稿' }).click()
  await expect(page).toHaveURL(/\/content\/scenes\/SCENE-1\/edit$/)
  const request = adminApi.findRequest('POST', '/api/v1/admin/media/ocr/jobs')
  expect(request).toBeUndefined()
  expect(adminApi.findRequest('POST', '/api/v1/admin/media/uploads/confirm')).toBeTruthy()
  expect(adminApi.findRequest('POST', '/api/v1/admin/content/scenes')).toBeUndefined()
})

test('显式 OCR 候选只采纳选择字段到同一草稿', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit')
  await page.getByLabel('学习原图素材编号').fill('ASSET-1')
  await page.getByRole('button', { name: '保存并识别原图' }).click()
  await page.getByRole('button', { name: '刷新识别状态' }).click()

  await expect(page.getByText('Coffee time')).toBeVisible()
  await page.getByRole('button', { name: '分配候选字段' }).hover()
  await page.getByRole('menuitem', { name: '英文标题', exact: true }).click()
  await page.getByLabel('候选英文标题').fill('Reviewed coffee')
  await page.getByRole('button', { name: '刷新识别状态' }).click()
  await expect(page.getByLabel('候选英文标题')).toHaveValue('Reviewed coffee')
  await page.getByRole('button', { name: '采纳选中字段到当前草稿' }).click()
  await expect(page.getByRole('textbox', { name: '英文标题', exact: true })).toHaveValue(
    'Reviewed coffee'
  )
  await expect(page.getByRole('textbox', { name: '中文标题', exact: true })).toHaveValue(
    '点一杯咖啡'
  )

  const request = adminApi.findRequest(
    'POST',
    '/api/v1/admin/content/revisions/REV-DRAFT-1/ocr-adoptions'
  )
  expect(request?.body).toMatchObject({
    job_id: 'JOB-1',
    selected_fields: ['title_en'],
    expected_version: 5,
    content: { title_en: 'Reviewed coffee' }
  })
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('音频人工版本与批量失败重试均携带幂等命令头', async ({ adminApi, page }) => {
  await page.route('**/__e2e-upload', async (route) => route.fulfill({ status: 204 }))
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/audio')
  await expect(page.getByText('SENTENCE-1', { exact: true })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from('e2e-audio'),
    mimeType: 'audio/mpeg',
    name: 'sentence.mp3'
  })
  await page.getByRole('button', { name: '开始上传音频' }).click()
  await expect(page.getByText('completed · 100%')).toBeVisible()

  const upload = adminApi.findRequest('POST', '/api/v1/admin/media/audio-targets/TARGET-1/versions')
  expect(upload?.body).toEqual({ asset_id: 'ASSET-AUDIO-2' })
  expect(upload?.headers['x-idempotency-key']).toBeTruthy()
  expect(adminApi.findRequest('POST', '/api/v1/admin/media/upload-policies')?.body).toEqual({
    asset_type: 'audio'
  })
  expect(adminApi.findRequest('POST', '/api/v1/admin/media/uploads/confirm')?.body).toMatchObject({
    asset_type: 'audio'
  })

  await navigateInApp(page, '/content/jobs')
  await page.getByText('COMPLETED_WITH_ERRORS').click()
  await page.getByRole('button', { name: '仅重试失败项' }).click()
  const retry = adminApi.findRequest(
    'POST',
    '/api/v1/admin/media/batch-jobs/BATCH-1/commands/retry-failed'
  )
  expect(retry?.headers['x-idempotency-key']).toBeTruthy()
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('媒体任务四页在两个验收视口无横向溢出', async ({ adminApi, page }, testInfo) => {
  await loginAsAdmin(page)
  for (const viewport of [
    { height: 900, width: 1440 },
    { height: 800, width: 1280 }
  ]) {
    await page.setViewportSize(viewport)
    for (const path of [
      '/content/import',
      '/content/ocr/JOB-1/ASSET-1',
      '/content/scenes/SCENE-1/audio',
      '/content/jobs'
    ]) {
      await navigateInApp(page, path)
      await expect(page.locator('main')).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow).toBeLessThanOrEqual(1)
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(
          `${path.replaceAll('/', '-')}-${viewport.width}x${viewport.height}.png`
        )
      })
    }
  }
  expect(adminApi.unexpectedRequests).toEqual([])
})
