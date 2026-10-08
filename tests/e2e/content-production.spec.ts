import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('绑定音频版本后选择器与草稿引用一致，切换 Tab 后继续保留', async ({ adminApi, page }) => {
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
  await page.getByRole('button', { name: '加载音频版本', exact: true }).click()
  await page.getByRole('combobox', { name: '整段音频版本', exact: true }).press('Enter')
  await page.getByRole('option', { name: 'v2 · ACTIVE · ASSET-AUDIO-1', exact: true }).click()
  await expect(page.getByText(/当前 VERSION-2/)).toBeVisible()
  const selection = page
    .locator('.scene-audio-panel .el-select')
    .getByText('v2 · ACTIVE · ASSET-AUDIO-1', { exact: true })
  await expect(selection).toBeVisible()
  await page.getByRole('tab', { name: '内容校对', exact: true }).click()
  await page.getByRole('tab', { name: '音频标时', exact: true }).click()
  await expect(selection).toBeVisible()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('草稿已保存')).toBeVisible()
  expect(
    adminApi.findRequest('PUT', '/api/v1/admin/content/revisions/REV-DRAFT-1')?.body
  ).toMatchObject({ content: { audio: { version_id: 'VERSION-2' } } })
})

test('内容生产六个 Tab 从列表选择明确场景并打开指定步骤', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes')
  const navigation = page.getByRole('navigation', { name: '内容生产流程' })
  await expect(navigation.getByRole('tab')).toHaveText([
    '内容列表',
    '场景草稿',
    'OCR候选',
    '内容校对',
    '音频标时',
    '预览发布'
  ])
  await expect(navigation.getByRole('tab', { name: '内容列表', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await navigation.getByRole('tab', { name: '音频标时', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '选择场景' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '进入工作区', exact: true })).toBeDisabled()
  await dialog.getByRole('combobox', { name: '工作区场景' }).press('Enter')
  await page.getByRole('option', { name: /Ordering coffee/ }).click()
  await dialog.getByRole('button', { name: '进入工作区', exact: true }).click()
  await expect(page).toHaveURL(/\/content\/scenes\/SCENE-1\/edit\?stage=audio$/)
  await expect(navigation.getByRole('tab', { name: '音频标时', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.getByRole('heading', { name: '逐句起止时间', exact: true })).toBeVisible()
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('切换工作区保留未保存草稿并保存同一版本后进入发布', async ({ adminApi, page }, testInfo) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit')
  const nav = page.getByRole('navigation', { name: '内容生产流程' })
  const title = page.getByLabel('英文标题', { exact: true })
  await title.fill('Across all production tabs')
  await page.getByLabel('英文句子 1', { exact: true }).fill('Keep this unsaved sentence.')
  for (const label of ['场景草稿', 'OCR候选', '音频标时', '内容校对']) {
    await nav.getByRole('tab', { name: label, exact: true }).click()
    await expect(nav.getByRole('tab', { name: label, exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  }
  await expect(title).toHaveValue('Across all production tabs')
  await expect(
    page.getByLabel('英文句子 1', { exact: true }).filter({ visible: true })
  ).toHaveValue('Keep this unsaved sentence.')
  await expect(page.getByLabel('开始毫秒 1')).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath('proofread-tabs.png'), fullPage: true })
  await nav.getByRole('tab', { name: '预览发布', exact: true }).click()
  await expect(page).toHaveURL(/\/content\/scenes\/REV-DRAFT-1\/publish$/)
  const save = adminApi.findRequest('PUT', '/api/v1/admin/content/revisions/REV-DRAFT-1')
  expect(save?.body).toMatchObject({
    content: {
      title_en: 'Across all production tabs',
      dialogue: [{ id: 'SENTENCE-1', english: 'Keep this unsaved sentence.' }]
    }
  })
  await nav.getByRole('tab', { name: '内容校对', exact: true }).click()
  await expect(page).toHaveURL(/\/content\/scenes\/SCENE-1\/edit\?stage=proofread$/)
  await expect(title).toHaveValue('Across all production tabs')
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('草稿保存冲突时进入发布被阻止且输入保留', async ({ adminApi, page }) => {
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit')
  await page.getByLabel('英文标题', { exact: true }).fill('Local conflict draft')
  adminApi.conflictOnNextRevisionSave()
  await page
    .getByRole('navigation', { name: '内容生产流程' })
    .getByRole('tab', { name: '预览发布', exact: true })
    .click()
  await expect(page.getByText(/远端已更新到/)).toBeVisible()
  await expect(page).toHaveURL(/\/content\/scenes\/SCENE-1\/edit$/)
  await expect(page.getByLabel('英文标题', { exact: true })).toHaveValue('Local conflict draft')
  expect(adminApi.requests.some((request) => request.pathname.endsWith('/preview'))).toBe(false)
})
