import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('图片上传开始后可以取消单个任务', async ({ adminApi, page }) => {
  await page.route('**/__e2e-upload', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    await route.fulfill({ status: 204 })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import')
  await page.getByLabel('系列编号').fill('SERIES-1')
  await page.getByLabel('识别模板').fill('TEMPLATE-1')
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from('e2e-image'),
    mimeType: 'image/png',
    name: 'scene.png'
  })
  await page.getByRole('button', { name: '开始上传' }).click()
  await expect(page.getByText('正在上传')).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()
  await expect(page.getByText('已取消')).toBeVisible()

  const policy = adminApi.findRequest('POST', '/api/v1/admin/media/upload-policies')
  expect(policy?.headers['x-csrf-token']).toBe('csrf-e2e')
})

test('发布警告必须确认后才能提交发布命令', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/REV-1/publish')
  await page.getByRole('button', { name: '运行发布检查' }).click()
  const publishButton = page.getByRole('button', { name: '确认发布' })
  await expect(publishButton).toBeDisabled()
  await page.getByText('确认警告：MISSING_OPTIONAL_AUDIO').click()
  await expect(publishButton).toBeEnabled()
  await publishButton.click()
  await expect(page.getByText('内容版本已发布')).toBeVisible()

  const request = adminApi.findRequest(
    'POST',
    '/api/v1/admin/content/revisions/REV-1/commands/publish'
  )
  expect(request?.body).toEqual({ acknowledged_warning_codes: ['MISSING_OPTIONAL_AUDIO'] })
  expect(request?.headers['x-csrf-token']).toBe('csrf-e2e')
})
