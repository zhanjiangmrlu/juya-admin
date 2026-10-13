import { createHash } from 'node:crypto'

import type { Page } from '@playwright/test'

import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

/** 切换同一内容的编辑区
 * @param page - 当前管理页面
 * @param label - 工作区名称
 */
const switchArea = async (page: Page, label: string): Promise<void> => {
  await page.getByRole('combobox', { name: '切换内容工作区', exact: true }).press('Enter')
  await page.getByRole('option', { name: label, exact: true }).click()
}

const reading = {
  title_en: 'An independent reading',
  title_zh: '独立阅读',
  category: '生活',
  topic: '日常',
  level: 'A2',
  safe_intro: '安全简介',
  copyright_source: '测试来源，尚未核验',
  copyright_status: 'PENDING',
  paragraphs_en: ['The unchanged first paragraph.', 'The second paragraph.'],
  paragraph_ids: ['PARA-1', 'PARA-2'],
  translation_zh: '第一段完整中文。\n第二段完整中文。',
  cover_asset_id: null,
  audio: null
}

test('短文双版本保存保留未修改段落编号且不自动核验版权', async ({ adminApi, page }, testInfo) => {
  let current = structuredClone(reading)
  let edited = 2
  let saved: Record<string, unknown> | null = null
  await page.route('**/api/v1/admin/content/short-readings/READING-1**', async (route) => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON()
      current = (saved as { content: typeof reading }).content
      edited++
      return route.fulfill({
        json: { content_id: 'READING-1', revision_id: 'READING-REV', version: 5 }
      })
    }
    const revision = route.request().url().includes('/revisions/')
    return route.fulfill({
      json: revision
        ? {
            public_id: 'READING-REV',
            edit_version: edited,
            status: 'DRAFT',
            content_snapshot: current,
            content_hash: 'a'.repeat(64)
          }
        : {
            public_id: 'READING-1',
            version: 5,
            series_id: 'SERIES-1',
            draft_revision_id: 'READING-REV',
            published_revision_id: null,
            status: 'DRAFT'
          }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/short-readings/READING-1/edit')
  await page.getByText('编辑正文与译文', { exact: true }).click()
  await expect(page.getByLabel('完整英文', { exact: true })).toHaveValue(
    reading.paragraphs_en.join('\n\n')
  )
  await page
    .getByLabel('完整英文', { exact: true })
    .fill('The unchanged first paragraph.\n\nThe changed second paragraph.')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('短文草稿已保存')).toBeVisible()
  expect(saved).toMatchObject({
    expected_version: 5,
    expected_edit_version: 2,
    content: {
      paragraphs_en: ['The unchanged first paragraph.', 'The changed second paragraph.'],
      copyright_status: 'PENDING',
      audio: null
    }
  })
  expect(current.paragraph_ids[0]).toBe('PARA-1')
  expect(current.paragraph_ids[1]).not.toBe('PARA-2')
  expect(adminApi.unexpectedRequests).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await expect(page.locator('.aside.collapsed .el-menu--collapse')).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('v15-short-reading-390.png'),
    fullPage: true,
    animations: 'disabled'
  })
})

test('词库候选采纳要求人工核对，未保存正文变更使候选失效', async ({ adminApi, page }) => {
  await page.route('**/api/v1/admin/content/revisions/*/candidates', (route) =>
    route.fulfill({
      json: { candidate_id: 'CANDIDATE-1', stage_id: 'CANDIDATE-1', status: 'ACCEPTED' }
    })
  )
  await page.route('**/api/v1/admin/content/candidates/CANDIDATE-1', (route) =>
    route.fulfill({
      json: {
        id: 'CANDIDATE-1',
        revision_id: 'REV-DRAFT-1',
        status: 'READY',
        input_hash: 'a'.repeat(64),
        candidate: {
          kind: 'AI_LEXICON',
          edit_version: 3,
          sources: { 'SENTENCE-1': 'What would you like?' },
          results: [
            { source_id: 'SENTENCE-1', english: 'would', chinese: '想要', start: 5, end: 10 }
          ]
        }
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=candidates')
  await page.getByRole('button', { name: '保存并请求词库候选', exact: true }).click()
  await expect(page.getByLabel('候选中文 1')).toHaveValue('想要')
  const adopt = page.getByRole('button', { name: '采纳这一项', exact: true })
  await expect(adopt).toBeDisabled()
  await page.locator('.content-candidates-panel .el-checkbox').click()
  await expect(adopt).toBeEnabled()
  await switchArea(page, '正文对照与配对校对')
  await page.getByLabel('英文句子 1', { exact: true }).fill('The source changed.')
  await switchArea(page, '中央词库候选')
  await page.getByLabel('候选任务编号').filter({ visible: true }).fill('CANDIDATE-1')
  await page.getByRole('button', { name: '恢复 / 刷新候选', exact: true }).click()
  await expect(adopt).toBeDisabled()
  expect(
    adminApi.requests.filter((request) => request.pathname.includes('/adoptions'))
  ).toHaveLength(0)
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
  await navigateInApp(page, '/content/import')
  await page.getByRole('button', { name: '添加音频或图片', exact: true }).click()
  const panel = page.locator('.content-materials-panel')
  await panel.getByRole('button', { name: '加载素材分类 / 草稿', exact: true }).click()
  // 分类异步加载时控件禁用，键盘操作前等待可用状态
  await expect(panel.getByRole('combobox', { name: '素材目标分类', exact: true })).toBeEnabled()
  await panel.getByRole('combobox', { name: '素材目标分类', exact: true }).press('Enter')
  await page.getByRole('option', { name: '日常英语', exact: true }).click()
  await panel.getByRole('combobox', { name: '素材内容模板', exact: true }).press('Enter')
  await page.getByRole('option', { name: '场景对话', exact: true }).click()
  await panel.getByLabel('素材批次编号').fill('MATERIAL-1')
  await panel.getByRole('button', { name: '恢复 / 刷新素材结果', exact: true }).click()
  await panel.getByRole('button', { name: '加载本页目标草稿', exact: true }).click()
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

test('首次创建短文跳转后可以继续编辑与保存', async ({ adminApi, page }) => {
  let saved = structuredClone(reading)
  let editVersion = 1
  await page.route('**/api/v1/admin/content/short-readings**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      saved = request.postDataJSON().content
      return route.fulfill({ json: { content_id: 'CREATED-READING' } })
    }
    if (request.method() === 'PUT') {
      saved = request.postDataJSON().content
      editVersion++
      return route.fulfill({ json: { content_id: 'CREATED-READING' } })
    }
    return route.fulfill({
      json: request.url().includes('/revisions/')
        ? {
            edit_version: editVersion,
            status: 'DRAFT',
            content_snapshot: saved,
            content_hash: 'a'.repeat(64)
          }
        : { version: 1, series_id: 'SERIES-1', draft_revision_id: 'CREATED-REV', status: 'DRAFT' }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/short-readings/new/edit?series_id=SERIES-1')
  for (const [label, value] of [
    ['英文标题', reading.title_en],
    ['中文标题', reading.title_zh],
    ['类别', reading.category],
    ['题材', reading.topic],
    ['难度', reading.level],
    ['安全简介', reading.safe_intro],
    ['来源与版权说明', reading.copyright_source],
    ['完整英文', reading.paragraphs_en.join('\n\n')],
    ['全文中文翻译', reading.translation_zh]
  ])
    await page.getByLabel(label!, { exact: true }).fill(value!)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page).toHaveURL(/CREATED-READING\/edit/)
  await page.getByText('编辑元信息', { exact: true }).click()
  await expect(page.getByLabel('英文标题', { exact: true })).toBeEnabled()
  await page.getByLabel('英文标题', { exact: true }).fill('Second save after creating')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => editVersion).toBe(2)
  expect(saved.title_en).toBe('Second save after creating')
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('单句重切先保存完整草稿，保留同页未保存的正文修改', async ({ adminApi, page }) => {
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
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=draft')
  await page.getByLabel('英文标题', { exact: true }).fill('Local metadata survives cutting')
  await switchArea(page, '场景音频对齐与切片')
  await page.getByText('上传 / 替换与选择音频版本', { exact: true }).click()
  await page.getByRole('button', { name: '调整边界', exact: true }).click()
  await page.getByRole('button', { name: '仅重生成这一句', exact: true }).click()
  await expect
    .poll(() => boundary)
    .toMatchObject({ expected_version: 4, manual_checked: true, start_ms: 0, end_ms: 2000 })
  await expect(page.getByRole('combobox', { name: '整段音频版本', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '移除整段音频', exact: true })).toHaveAttribute(
    'disabled',
    ''
  )
  await expect(page.getByRole('button', { name: '试听独立文件', exact: true })).toBeDisabled()
  releaseBoundary()
  expect(
    adminApi.findRequest('PUT', '/api/v1/admin/content/revisions/REV-DRAFT-1')?.body
  ).toMatchObject({ content: { title_en: 'Local metadata survives cutting' } })
  await expect(page.getByRole('button', { name: '刷新切片状态', exact: true })).toBeEnabled()
  await switchArea(page, '场景结构化编辑')
  await expect(page.getByLabel('英文标题', { exact: true })).toHaveValue(
    'Local metadata survives cutting'
  )
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('固定短文抽样完成后只批准明确选择且不伪造听音事实', async ({ adminApi, page }) => {
  const sorted = Object.fromEntries(Object.entries(reading).sort(([a], [b]) => a.localeCompare(b)))
  const hash = createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
  const collection = {
    public_id: 'SET-1',
    collection_hash: 'b'.repeat(64),
    status: 'PENDING',
    normal_count: 1,
    candidates: [
      {
        content_type: 'short_reading',
        content_id: 'READING-1',
        revision_id: 'READING-REV',
        candidate_hash: hash,
        normal: true
      }
    ],
    sample_ids: ['READING-REV'],
    confirmed_ids: [] as string[]
  }
  let checks: unknown = null
  let approval: unknown = null
  const approvalKeys: string[] = []
  await page.route('**/api/v1/admin/content/short-readings/READING-1**', (route) =>
    route.fulfill({
      json: route.request().url().includes('/revisions/')
        ? { edit_version: 2, status: 'DRAFT', content_snapshot: reading, content_hash: hash }
        : { version: 5, series_id: 'SERIES-1', draft_revision_id: 'READING-REV', status: 'DRAFT' }
    })
  )
  await page.route('**/api/v1/admin/content/proofreading**', async (route) => {
    const url = route.request().url()
    if (url.includes('/items/')) {
      checks = route.request().postDataJSON()
      collection.confirmed_ids = ['READING-REV']
    }
    if (url.endsWith('/normal/bulk-confirm')) {
      approval = route.request().postDataJSON()
      approvalKeys.push(route.request().headers()['idempotency-key'] || '')
      if (approvalKeys.length === 1) return route.abort('failed')
    }
    return route.fulfill({ json: collection })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/short-readings/READING-1/edit')
  await page.getByText('人工校对与正常抽样', { exact: true }).click()
  await page.getByRole('button', { name: '建立当前明确候选集合', exact: true }).click()
  const panel = page.locator('.proofreading-set-panel')
  await expect(panel.getByText('The unchanged first paragraph.', { exact: true })).toBeVisible()
  await panel.locator('.el-checkbox').filter({ hasText: '已核对完整正文、全文译文' }).click()
  await page.getByRole('button', { name: '确认这一篇', exact: true }).click()
  await expect(panel.getByRole('combobox', { name: '当前校对候选' })).toHaveValue('')
  await expect(panel.getByText(/独立阅读.*已确认/).first()).toBeVisible()
  await panel.locator('.el-checkbox-group .el-checkbox').click()
  const approve = page.getByRole('button', { name: '批准明确选中 1 篇正常候选', exact: true })
  await expect(approve).toBeDisabled()
  await panel.locator('.el-checkbox').filter({ hasText: '接受所选正常结构化结果' }).click()
  await approve.click()
  await expect.poll(() => approvalKeys.length).toBe(1)
  await expect(approve).toBeEnabled()
  await approve.click()
  await expect.poll(() => approvalKeys.length).toBe(2)
  expect(approvalKeys[0]).toMatch(/^idem-/)
  expect(approvalKeys[1]).toBe(approvalKeys[0])
  await expect
    .poll(() => approval)
    .toEqual({
      collection_hash: 'b'.repeat(64),
      revision_ids: ['READING-REV'],
      accept_normal_results: true
    })
  expect(checks).toEqual({
    candidate_hash: hash,
    text_checked: true,
    images_checked: false,
    audio_listened: false
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
  await navigateInApp(page, '/content/short-readings/RACE-READING/edit')
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
