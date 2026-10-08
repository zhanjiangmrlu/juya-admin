import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

for (const reused of [false, true]) {
  test(`图片导入明确显示${reused ? '复用' : '新建'}场景并进入对应编辑页`, async ({
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
    await page.getByRole('button', { name: '编辑场景草稿' }).click()
    await expect(page).toHaveURL(/\/content\/scenes\/SCENE-1\/edit$/)
    expect(adminApi.findRequest('POST', '/api/v1/admin/media/ocr/jobs')).toBeUndefined()
    expect(adminApi.unexpectedRequests).toEqual([])
  })
}
