import type { Page } from '@playwright/test'

import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

/** 切换同一内容的实际编辑工作区
 * @param page - 当前已登录管理页面
 * @param label - 工作区显示名称
 */
const selectWorkspace = async (page: Page, label: string): Promise<void> => {
  await page.getByRole('combobox', { name: '切换内容工作区', exact: true }).press('Enter')
  await page.getByRole('option', { name: label, exact: true }).click()
}

test('绑定音频版本后切换工作区继续保留固定引用', async ({ adminApi, page }) => {
  await page.route('**/api/v1/admin/media/audio-targets/TARGET-1/versions', (route) =>
    route.fulfill({
      json: {
        items: [1, 2].map((number) => ({
          id: `VERSION-${number}`,
          asset_id: 'ASSET-AUDIO-1',
          target_id: 'TARGET-1',
          version_no: number,
          source: 'MANUAL',
          status: 'ACTIVE',
          created_at: '2026-09-30T10:00:00Z',
          created_by: 'ADMIN-1',
          processing_job_id: null,
          provider_request_id: null
        }))
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=audio')
  await page.getByText('上传 / 替换与选择音频版本', { exact: true }).click()
  await page.getByRole('button', { name: '加载音频版本', exact: true }).click()
  await page.getByRole('combobox', { name: '整段音频版本', exact: true }).press('Enter')
  await page.getByRole('option', { name: 'v2 · ACTIVE · ASSET-AUDIO-1', exact: true }).click()
  await expect(page.getByText(/当前 VERSION-2/)).toBeVisible()
  await selectWorkspace(page, '正文对照与配对校对')
  await selectWorkspace(page, '场景音频对齐与切片')
  await expect(page.getByText(/当前 VERSION-2/)).toBeVisible()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('草稿已保存')).toBeVisible()
  expect(
    adminApi.findRequest('PUT', '/api/v1/admin/content/revisions/REV-DRAFT-1')?.body
  ).toMatchObject({ content: { audio: { version_id: 'VERSION-2' } } })
})

test('独立工作区保留未保存输入并保存同一版本后进入发布', async ({ adminApi, page }, testInfo) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=draft')
  await page.getByLabel('英文标题', { exact: true }).fill('Across all authoring areas')
  await selectWorkspace(page, '正文对照与配对校对')
  await page.getByLabel('英文句子 1', { exact: true }).fill('Keep this unsaved sentence.')
  for (const label of ['本篇词汇与语块', '场景音频对齐与切片', '正文对照与配对校对'])
    await selectWorkspace(page, label)
  await expect(page.getByLabel('英文句子 1', { exact: true })).toHaveValue(
    'Keep this unsaved sentence.'
  )
  await expect(page.getByRole('heading', { name: '已保存输入 · 只读', exact: true })).toBeVisible()
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [1920, 1080]
  ]) {
    await page.setViewportSize({ width, height })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await expect(
      page.locator('#admin-page-actions').getByRole('button', { name: '保存配对结果', exact: true })
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(`authoring-comparison-${width}.png`),
      fullPage: true,
      animations: 'disabled'
    })
  }
  await selectWorkspace(page, '预览与发布检查')
  await expect(page).toHaveURL(/\/content\/scenes\/REV-DRAFT-1\/publish$/)
  expect(
    adminApi.findRequest('PUT', '/api/v1/admin/content/revisions/REV-DRAFT-1')?.body
  ).toMatchObject({
    content: {
      title_en: 'Across all authoring areas',
      dialogue: [{ id: 'SENTENCE-1', english: 'Keep this unsaved sentence.' }]
    }
  })
  await selectWorkspace(page, '场景结构化编辑')
  await expect(page.getByLabel('英文标题', { exact: true })).toHaveValue(
    'Across all authoring areas'
  )
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('草稿保存冲突阻止进入发布并保留所有输入', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=draft')
  await page.getByLabel('英文标题', { exact: true }).fill('Local conflict draft')
  adminApi.conflictOnNextRevisionSave()
  await selectWorkspace(page, '预览与发布检查')
  await expect(page.getByText(/远端已更新到/)).toBeVisible()
  await expect(page).toHaveURL(/stage=draft$/)
  await expect(page.getByLabel('英文标题', { exact: true })).toHaveValue('Local conflict draft')
  expect(adminApi.requests.some((request) => request.pathname.endsWith('/preview'))).toBe(false)
})
