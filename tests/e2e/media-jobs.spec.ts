import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('图片确认后创建 OCR 任务并提供校对入口', async ({ adminApi, page }) => {
  await page.route('**/__e2e-upload', async (route) => route.fulfill({ status: 204 }))
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import')
  await page.getByLabel('系列编号').fill('SERIES-1')
  await page.getByLabel('识别模板').fill('learning-card')
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from('e2e-image'),
    mimeType: 'image/png',
    name: 'scene.png'
  })
  await page.getByRole('button', { name: '开始上传' }).click()

  await expect(page.getByRole('link', { name: '进入 OCR 校对' })).toBeVisible()
  const request = adminApi.findRequest('POST', '/api/v1/admin/media/ocr/jobs')
  expect(request?.body).toMatchObject({ series_id: 'SERIES-1', template_id: 'learning-card' })
  expect(request?.headers['x-idempotency-key']).toBeTruthy()
})

test('OCR 候选人工确认使用真实命令并保留结构化内容', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/ocr/JOB-1/ASSET-1')

  await expect(page.getByText('Coffee time')).toBeVisible()
  await page.getByLabel('场景编号').fill('SCENE-1')
  await page.getByLabel('校对后的结构化 JSON').fill('{"title":"Reviewed coffee"}')
  await page.getByRole('button', { name: '保存人工版本' }).click()
  await expect(page.getByText('人工版本已保存：REV-OCR-2 · DRAFT')).toBeVisible()

  const request = adminApi.findRequest(
    'POST',
    '/api/v1/admin/media/ocr/jobs/JOB-1/commands/confirm'
  )
  expect(request?.body).toEqual({ content: { title: 'Reviewed coffee' }, scene_id: 'SCENE-1' })
  expect(request?.headers['x-idempotency-key']).toBeTruthy()
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
