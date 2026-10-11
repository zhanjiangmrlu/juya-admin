import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

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
