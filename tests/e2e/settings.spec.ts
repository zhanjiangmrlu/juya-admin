import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('配置冲突展示远端版本并保留本地草稿', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  adminApi.conflictOnNextSettingsUpdate()
  await navigateInApp(page, '/settings')
  await expect(page.getByRole('heading', { level: 1, name: '系统配置与审核开关' })).toBeVisible()
  const feedbackHours = page.getByRole('spinbutton').first()
  await feedbackHours.fill('48')
  await page.getByRole('button', { name: '保存配置' }).click()

  await expect(page.getByRole('dialog', { name: '配置版本冲突' })).toBeVisible()
  await expect(page.getByText('远端版本 v4')).toBeVisible()
  await expect(page.getByText('"feedbackSlaHours": 48')).toBeVisible()
  const request = adminApi.requests.find(
    (item) => item.method === 'PATCH' && item.pathname.startsWith('/api/v1/admin/settings/')
  )
  expect(request?.body).toMatchObject({ expected_version: 3 })
  expect(request?.headers['x-csrf-token']).toBe('csrf-e2e')
})

test('学习与资料入口开关分别保存、刷新回读并恢复另一项状态', async ({ adminApi, page }) => {
  test.setTimeout(45_000)
  let current = { recording_enabled: false, profile_completion_enabled: false, version: 0 }
  const writes: Record<string, unknown>[] = []
  await page.route('**/api/v1/admin/learning-features', (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON()
      expect(body.expected_version).toBe(current.version)
      expect(typeof body.recording_enabled).toBe('boolean')
      expect(typeof body.profile_completion_enabled).toBe('boolean')
      expect(route.request().headers()['idempotency-key']).toBeTruthy()
      writes.push(body)
      current = {
        recording_enabled: body.recording_enabled,
        profile_completion_enabled: body.profile_completion_enabled,
        version: current.version + 1
      }
    }
    return route.fulfill({ json: current })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/settings')
  const recording = page.getByRole('switch', { name: '跟读录音权限', exact: true })
  const profile = page.getByRole('switch', { name: '完善资料次级入口', exact: true })
  const save = page.getByRole('button', { name: '保存学习与资料入口', exact: true })
  await expect(recording).toBeEnabled()
  await page.locator('.learning-features-panel .el-switch').filter({ has: recording }).click()
  await save.click()
  await expect.poll(() => writes.length).toBe(1)
  await page.reload()
  await expect(recording).toHaveAttribute('aria-checked', 'true')
  await expect(profile).toHaveAttribute('aria-checked', 'false')
  await page.locator('.learning-features-panel .el-switch').filter({ has: recording }).click()
  await save.click()
  await expect.poll(() => writes.length).toBe(2)
  await expect(save).toBeEnabled()
  await page.locator('.learning-features-panel .el-switch').filter({ has: profile }).click()
  await save.click()
  await expect.poll(() => writes.length).toBe(3)
  await page.reload()
  await expect(profile).toHaveAttribute('aria-checked', 'true')
  await expect(recording).toHaveAttribute('aria-checked', 'false')
  await page.locator('.learning-features-panel .el-switch').filter({ has: profile }).click()
  await save.click()
  await expect.poll(() => writes.length).toBe(4)
  expect(writes.map((row) => [row.recording_enabled, row.profile_completion_enabled])).toEqual([
    [true, false],
    [false, false],
    [false, true],
    [false, false]
  ])
  expect(current).toEqual({
    recording_enabled: false,
    profile_completion_enabled: false,
    version: 4
  })
  expect(adminApi.unexpectedRequests).toEqual([])
})
