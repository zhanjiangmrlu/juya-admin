import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { item, mockWorkOrder, reading, scene } from './fixtures/content-work-orders'

test('短文修正保留未修改段落身份且不自动核验版权', async ({ adminApi, page }, testInfo) => {
  expect(adminApi).toBeDefined()
  const body = {
    ...reading,
    paragraphs_en: ['The unchanged first paragraph.', 'The second paragraph.'],
    paragraph_ids: ['PARA-1', 'PARA-2'],
    copyright_status: 'PENDING'
  }
  const requests = await mockWorkOrder(page, { template: 'short_reading', content: body })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  await page.getByText('编辑正文与译文', { exact: true }).click()
  await page
    .getByLabel('完整英文', { exact: true })
    .fill('The unchanged first paragraph.\n\nThe changed second paragraph.')
  await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
  await expect.poll(() => requests.filter((row) => row.path.endsWith('/correction')).length).toBe(1)
  const saved = (
    requests.find((row) => row.path.endsWith('/correction'))!.body.current as {
      content: typeof body
    }
  ).content
  expect(saved).toMatchObject({
    paragraphs_en: ['The unchanged first paragraph.', 'The changed second paragraph.'],
    copyright_status: 'PENDING',
    audio: null
  })
  expect(saved.paragraph_ids[0]).toBe('PARA-1')
  expect(saved.paragraph_ids[1]).not.toBe('PARA-2')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('v15-work-reading-390.png'), fullPage: true })
})

test('服务端标记过期的词库候选不能采纳且可明确放弃可选推荐', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const requests = await mockWorkOrder(page, { template: 'dialogue', content: scene })
  let stale = false
  await page.route('**/work-orders/order/candidates', (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            candidate_id: 'group',
            item_id: 'one',
            kind: 'AI_LEXICON',
            status: 'READY',
            stale,
            expected_edit_version: 1,
            results: [
              {
                result_id: 'result',
                status: 'PENDING',
                source_id: 'SENTENCE-1',
                english: 'would',
                chinese: '想要',
                start: 5,
                end: 10
              }
            ]
          }
        ]
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order?view=candidates')
  await expect(page.getByRole('button', { name: '采纳本条', exact: true })).toBeEnabled()
  expect(requests.some((row) => row.path.endsWith('/candidate-decisions'))).toBe(false)
  stale = true
  await page.getByRole('button', { name: '刷新进度', exact: true }).click()
  await expect(page.getByText('· 内容已变化，请重新整理', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: '采纳本条', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '放弃本次推荐', exact: true }).click()
  await expect
    .poll(() => requests.some((row) => row.path.endsWith('/candidate-dismissals')))
    .toBe(true)
  expect(requests.some((row) => row.path.endsWith('/candidate-decisions'))).toBe(false)
})

test('单篇新建短文进入工作单后可以继续编辑并保存', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const requests = await mockWorkOrder(page)
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes')
  await page.getByRole('button', { name: '单篇新建', exact: true }).click()
  await page.getByRole('combobox', { name: '新场景所属系列', exact: true }).press('Enter')
  await page.getByRole('option', { name: '日常英语', exact: true }).click()
  await page
    .getByRole('dialog', { name: '单篇新建', exact: true })
    .getByText('短文阅读', { exact: true })
    .click()
  await page.getByRole('button', { name: '创建并编辑', exact: true }).click()
  await expect(page).toHaveURL(/work-orders\/order\/items\/one/)
  await page.getByText('编辑元信息', { exact: true }).click()
  await page.getByLabel('英文标题', { exact: true }).fill('Second save after creating')
  await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
  await expect.poll(() => requests.filter((row) => row.path.endsWith('/correction')).length).toBe(1)
  expect(requests.find((row) => row.path.endsWith('/manual'))?.body.content_type).toBe(
    'short_reading'
  )
  expect(requests.find((row) => row.path.endsWith('/correction'))?.body).toMatchObject({
    current: { content: { title_en: 'Second save after creating' } }
  })
})

test('独立素材包明确选择草稿、文件角色与稳定词条后绑定', async ({ adminApi, page }) => {
  await page.route('**/api/v1/admin/content/catalogue?**', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'SCENE-1',
            title_en: 'Ordering coffee',
            title_zh: '',
            draft_revision_id: 'REV-DRAFT-1',
            content_type: 'dialogue',
            status: 'PUBLISHED'
          },
          {
            id: 'SCENE-2',
            title_en: 'Another target',
            title_zh: '',
            draft_revision_id: 'REV-SECOND',
            content_type: 'dialogue',
            status: 'DRAFT'
          }
        ],
        total: 2,
        page: 1,
        page_size: 100
      }
    })
  )
  let body: unknown = null
  await page.route('**/api/v1/admin/content-materials**', async (route) => {
    if (route.request().method() === 'POST') {
      body = route.request().postDataJSON()
      return route.fulfill({ json: { status: 'PENDING', stage_id: 'STAGE-1' } })
    }
    return route.fulfill({
      json: {
        batch_id: 'MATERIAL-1',
        status: 'PREVIEW_READY',
        input_hash: 'c'.repeat(64),
        manifest: {
          resources: [
            {
              path: 'word.png',
              sha256: 'd'.repeat(64),
              allowed_roles: ['WORD_IMAGE'],
              ambiguous_title: false,
              matching_candidates: []
            }
          ]
        }
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(
    page,
    '/content/import?source=materials&series_id=SERIES-1&content_type=dialogue&material_batch_id=MATERIAL-1'
  )
  const panel = page.locator('.content-materials-panel')
  await panel.getByRole('button', { name: '加载本页目标草稿', exact: true }).click()
  // 等待草稿加载解除禁用后再打开选项，避免遗漏键盘输入
  await expect(panel.getByRole('combobox', { name: '素材目标草稿', exact: true })).toBeEnabled()
  await panel.getByRole('combobox', { name: '素材目标草稿', exact: true }).press('Enter')
  await page.getByRole('option', { name: /Ordering coffee · REV-DRAFT-1/ }).click()
  await panel.getByRole('button', { name: '读取固定草稿', exact: true }).click()
  await panel.locator('article .el-checkbox').click()
  await panel.getByRole('combobox', { name: '素材角色 1', exact: true }).press('Enter')
  await page.getByRole('option', { name: '词汇小图', exact: true }).click()
  await panel.getByRole('combobox', { name: '素材词条 1', exact: true }).press('Enter')
  await page.getByRole('option', { name: /latte/ }).click()
  await page.getByRole('button', { name: '查看合格预览', exact: true }).click()
  const bind = page.getByRole('button', { name: '确认导入', exact: true })
  await expect(bind).toBeDisabled()
  await panel.locator('.el-checkbox').filter({ hasText: '已逐项核对文件' }).click()
  await expect(bind).toBeEnabled()
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await panel.getByRole('combobox', { name: '素材目标草稿', exact: true }).press('Enter')
  await page.getByRole('option', { name: /Another target · REV-SECOND/ }).click()
  await expect(page.getByRole('button', { name: '查看合格预览', exact: true })).toBeDisabled()
  expect(body).toBeNull()
  await panel.getByRole('combobox', { name: '素材目标草稿', exact: true }).press('Enter')
  await page.getByRole('option', { name: /Ordering coffee · REV-DRAFT-1/ }).click()
  await panel.getByRole('button', { name: '读取固定草稿', exact: true }).click()
  await page.getByRole('button', { name: '查看合格预览', exact: true }).click()
  await expect(bind).toBeDisabled()
  await panel.locator('.el-checkbox').filter({ hasText: '已逐项核对文件' }).click()
  await bind.click()
  await expect
    .poll(() => body)
    .toMatchObject({
      revision_id: 'REV-DRAFT-1',
      expected_version: 3,
      manual_checked: true,
      bindings: [{ path: 'word.png', role: 'WORD_IMAGE' }]
    })
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('短文替换音频后迟到的旧签名不能覆盖新文件或解锁旧试听确认', async ({ adminApi, page }) => {
  const audioA = {
    target_id: 'FULL-A',
    asset_id: 'AUDIO-A',
    version_id: 'VERSION-A',
    duration_ms: 1000
  }
  const audioB = {
    target_id: 'FULL-B',
    asset_id: 'AUDIO-B',
    version_id: 'VERSION-B',
    duration_ms: 2000
  }
  let current = { ...structuredClone(reading), audio: audioA }
  await mockWorkOrder(page, { template: 'short_reading', content: current })
  await page.route('**/work-orders/order/items/one', (route) =>
    route.fulfill({
      json: {
        ...item,
        content_id: 'RACE-READING',
        revision_id: 'RACE-REV',
        current: { template: 'short_reading', content: current }
      }
    })
  )
  let releaseA!: () => void
  let signingA = false
  await page.route('**/api/v1/admin/media/assets/AUDIO-A/signed-url', async (route) => {
    signingA = true
    await new Promise<void>((done) => {
      releaseA = done
    })
    await route.fulfill({
      json: { url: '/__audio-A.wav', expires_at: new Date(Date.now() + 60000).toISOString() }
    })
  })
  await page.route('**/api/v1/admin/media/assets/AUDIO-B/signed-url', (route) =>
    route.fulfill({
      json: { url: '/__audio-B.wav', expires_at: new Date(Date.now() + 60000).toISOString() }
    })
  )
  await page.route('**/api/v1/admin/content/short-readings/RACE-READING**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/audio-upload-target/bind')) {
      current = { ...current, audio: audioB }
      return route.fulfill({ json: { version: 2 } })
    }
    if (path.endsWith('/audio-upload-target'))
      return route.fulfill({
        json: {
          id: 'FULL-B',
          target_type: 'FULL',
          content_id: 'RACE-READING',
          revision_id: 'RACE-REV'
        }
      })
    return route.fulfill({
      json: path.includes('/revisions/')
        ? {
            public_id: 'RACE-REV',
            status: 'DRAFT',
            edit_version: current.audio === audioA ? 1 : 2,
            content_snapshot: current,
            content_hash: 'a'.repeat(64)
          }
        : { public_id: 'RACE-READING', version: 1, draft_revision_id: 'RACE-REV', status: 'DRAFT' }
    })
  })
  await page.route('**/api/v1/admin/media/upload-policies', (route) =>
    route.fulfill({ json: { upload_url: '/__audio-upload', fields: { key: 'audio/test.wav' } } })
  )
  await page.route('**/__audio-upload', (route) => route.fulfill({ status: 204 }))
  await page.route('**/api/v1/admin/media/uploads/confirm', (route) =>
    route.fulfill({ json: { id: 'AUDIO-B', status: 'CONFIRMED' } })
  )
  await page.route('**/api/v1/admin/media/audio-targets/FULL-B/versions', (route) =>
    route.fulfill({
      json: {
        id: 'VERSION-B',
        target_id: 'FULL-B',
        asset_id: 'AUDIO-B',
        status: 'CANDIDATE',
        version_no: 1,
        source: 'UPLOAD',
        created_at: new Date().toISOString()
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  await expect.poll(() => signingA).toBe(true)
  await page
    .locator('.short-reading-fields input[type=file]')
    .last()
    .setInputFiles({
      name: 'test.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from('fixture bytes for transport race only')
    })
  const player = page.locator('.short-reading-fields audio')
  await expect(player).toHaveAttribute('src', /__audio-B.wav$/)
  releaseA()
  await page.waitForResponse((response) => response.url().endsWith('/AUDIO-A/signed-url'))
  await expect(player).toHaveAttribute('src', /__audio-B.wav$/)
  await expect(
    page.getByRole('checkbox', { name: '已实际试听完整音频，确认与本篇正文一致' })
  ).toBeDisabled()
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('单句重切使用工作单当前版本并锁定相关音频操作', async ({ adminApi, page }) => {
  let boundary: Record<string, unknown> | null = null
  let releaseBoundary!: () => void
  const boundaryReady = new Promise<void>((resolve) => {
    releaseBoundary = resolve
  })
  await page.route(
    '**/api/v1/admin/content/revisions/*/sentences/*/boundary-confirm',
    async (route) => {
      boundary = route.request().postDataJSON()
      await boundaryReady
      return route.fulfill({ json: { dependency_hash: 'e'.repeat(64) } })
    }
  )
  await page.route('**/api/v1/admin/content/revisions/*/sentences/*/slice-preview?**', (route) =>
    route.fulfill({ status: 409, json: { code: 'SLICE_NOT_READY', message: '切片仍在生成' } })
  )
  await loginAsAdmin(page)
  await navigateInApp(
    page,
    '/content/scenes/SCENE-1/edit?stage=audio&work_order_id=order&work_item_id=one'
  )

  await page.getByText('上传 / 替换与选择音频版本', { exact: true }).click()
  await page.getByRole('button', { name: '调整边界', exact: true }).click()
  await page.getByRole('button', { name: '仅重生成这一句', exact: true }).click()
  await expect
    .poll(() => boundary)
    .toMatchObject({ expected_version: 3, manual_checked: true, start_ms: 0, end_ms: 2000 })
  await expect(page.getByRole('combobox', { name: '整段音频版本', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '移除整段音频', exact: true })).toHaveAttribute(
    'disabled',
    ''
  )
  await expect(page.getByRole('button', { name: '试听独立文件', exact: true })).toBeDisabled()
  releaseBoundary()
  expect(adminApi.findRequest('PUT', '/api/v1/admin/content/revisions/REV-DRAFT-1')).toBeUndefined()
  await expect(page.getByRole('button', { name: '刷新切片状态', exact: true })).toBeEnabled()
  expect(adminApi.unexpectedRequests).toEqual([])
})
