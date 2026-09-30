import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

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

  const title = page.getByLabel('场景标题')
  await expect(title).toHaveValue('Ordering coffee')
  await title.fill('本地仍需保留的标题')
  await page.getByRole('button', { name: '保存草稿' }).click()

  await expect(page.getByText(/远端已更新到 v4/)).toBeVisible()
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
