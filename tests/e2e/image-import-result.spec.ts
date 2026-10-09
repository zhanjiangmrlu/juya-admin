import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

for (const reused of [false, true]) {
  test(`图片导入明确显示${reused ? '复用' : '新建'}场景并打开对应内容`, async ({
    adminApi,
    page
  }) => {
    await page.route('**/__e2e-upload', async (route) => route.fulfill({ status: 204 }))
    await page.route('**/api/v1/admin/content/imports', async (route) =>
      route.fulfill({
        status: 201,
        json: { items: [{ id: 'SCENE-1' }], reused_scene_ids: reused ? ['SCENE-1'] : [] }
      })
    )
    await loginAsAdmin(page)
    await navigateInApp(page, '/content/import')
    await page.evaluate(() =>
      sessionStorage.setItem(
        'juya.content-list.filters.v1',
        JSON.stringify({ page: 3, pageSize: 10, query: 'old', seriesId: 'OTHER', status: 'DRAFT' })
      )
    )
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
    await expect(
      page.getByText(
        reused ? '上传已确认，相同图片已复用已有场景，未新增记录' : '上传已确认，已新建场景草稿',
        { exact: true }
      )
    ).toBeVisible()
    await expect(page.getByText('场景编号：SCENE-1', { exact: true })).toBeVisible()
    if (reused) {
      await expect(page.getByRole('alert').filter({ hasText: '重复图片 1 张' })).toBeVisible()
      await page.getByRole('button', { name: '查看已有内容', exact: true }).click()
      await expect(page).toHaveURL(/\/content\/scenes\?scene_id=SCENE-1$/)
      await expect(page.getByText('Ordering coffee', { exact: true })).toBeVisible()
      const request = adminApi.findRequest('GET', '/api/v1/admin/content/scenes')
      const url = new URL(request!.url)
      expect(url.searchParams.get('query')).toBe('SCENE-1')
      expect(url.searchParams.get('page')).toBe('1')
      expect(url.searchParams.has('series_id')).toBe(false)
      expect(url.searchParams.has('status')).toBe(false)
      await page.getByRole('button', { name: '编辑草稿', exact: true }).click()
      await expect(page).toHaveURL(/\/content\/scenes\/SCENE-1\/edit$/)
      await page.getByRole('tab', { name: '内容列表', exact: true }).click()
      await expect(page).toHaveURL(/\/content\/scenes$/)
      await expect(page.getByPlaceholder('场景名称或编号')).toHaveValue('SCENE-1')
      await expect(page.getByText('Ordering coffee', { exact: true })).toBeVisible()
      const latestRequest = adminApi.requests
        .filter((item) => item.method === 'GET' && item.pathname === '/api/v1/admin/content/scenes')
        .at(-1)
      const latestUrl = new URL(latestRequest!.url)
      expect(latestUrl.searchParams.get('query')).toBe('SCENE-1')
      expect(latestUrl.searchParams.has('series_id')).toBe(false)
      expect(latestUrl.searchParams.has('status')).toBe(false)
    } else {
      await expect(page.getByRole('button', { name: '查看已有内容', exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: '编辑场景草稿' }).click()
      await expect(page).toHaveURL(/\/content\/scenes\/SCENE-1\/edit$/)
    }
    expect(adminApi.findRequest('POST', '/api/v1/admin/media/ocr/jobs')).toBeUndefined()
    expect(adminApi.unexpectedRequests).toEqual([])
  })
}

test('混合批量上传只统计重复图片，保留新建草稿入口', async ({ adminApi, page }) => {
  await page.route('**/__e2e-upload', async (route) => route.fulfill({ status: 204 }))
  let imports = 0
  await page.route('**/api/v1/admin/content/imports', async (route) => {
    const reused = ++imports === 2
    await route.fulfill({
      status: 201,
      json: {
        items: [{ id: reused ? 'SCENE-1' : 'SCENE-2' }],
        reused_scene_ids: reused ? ['SCENE-1'] : []
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import')
  await page.getByLabel('系列编号').press('Enter')
  await page.getByRole('option', { name: '日常英语' }).click()
  await page.getByLabel('识别模板').press('Enter')
  await page.getByRole('option', { name: '对话', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles(
    ['new.png', 'duplicate.png'].map((name) => ({
      buffer: Buffer.from(name),
      mimeType: 'image/png',
      name
    }))
  )
  await expect(page.getByRole('button', { name: '查看已有内容', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '开始上传' }).click()
  await expect(page.getByText('上传已确认，已新建场景草稿', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: '重复图片 1 张' })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看已有内容', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: '编辑场景草稿', exact: true })).toHaveCount(2)
  expect(adminApi.findRequest('POST', '/api/v1/admin/media/ocr/jobs')).toBeUndefined()
  expect(adminApi.unexpectedRequests).toEqual([])
})
