import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('图片确认只上传素材并提供场景录入入口', async ({ adminApi, page }) => {
  await page.route('**/__e2e-upload', async (route) => route.fulfill({ status: 204 }))
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import')
  await page.locator('.batch-form').getByLabel('内容分类').press('Enter')
  await page.getByRole('option', { name: '日常英语' }).click()
  await page.locator('.batch-form').getByLabel('内容类型').press('Enter')
  await page.getByRole('option', { name: '对话', exact: true }).click()
  await page
    .locator('.content-import-page input[type="file"]')
    .last()
    .setInputFiles({
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

test('音频人工版本与批量失败重试均携带幂等命令头', async ({ adminApi, page }) => {
  await page.route('**/__e2e-upload', async (route) => route.fulfill({ status: 204 }))
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/audio')
  await expect(page.getByText('SENTENCE-1', { exact: true })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from('e2e-audio'),
    mimeType: 'audio/mpeg',
    name: 'SENTENCE-1.mp3'
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

test('退役 OCR 深链仅展示说明且不会调用 OCR 接口', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/ocr/JOB-1/ASSET-1')
  await expect(page.getByRole('heading', { name: 'OCR 功能已取消', level: 3 })).toBeVisible()
  expect(adminApi.requests.filter((request) => request.pathname.includes('/ocr'))).toEqual([])
})
