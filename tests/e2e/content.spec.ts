import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('图片上传开始后可以取消单个任务', async ({ adminApi, page }) => {
  await page.route('**/__e2e-upload', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    await route.fulfill({ status: 204 })
  })
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
  expect(request?.body).toEqual({
    acknowledged_warning_codes: ['MISSING_OPTIONAL_AUDIO'],
    expected_version: 3
  })
  expect(request?.headers['x-csrf-token']).toBe('csrf-e2e')
})

test('未通过的发布检查显示具体缺项并保持发布禁用', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/REV-1/publish')
  await page.route('**/api/v1/admin/content/revisions/REV-1/publish-checks', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        revision_id: 'REV-1',
        version: 3,
        ready: false,
        error_codes: ['TITLE_REQUIRED', 'DIALOGUE_REQUIRED', 'AUDIO_MISSING'],
        warning_codes: []
      })
    })
  )
  await page.getByRole('button', { name: '运行发布检查' }).click()
  await expect(page.getByText('请填写英文标题和中文标题')).toBeVisible()
  await expect(page.getByText('请添加对话，并填写说话人、英文和中文')).toBeVisible()
  await expect(page.getByText('请上传并确认整段音频')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认发布' })).toBeDisabled()
})
