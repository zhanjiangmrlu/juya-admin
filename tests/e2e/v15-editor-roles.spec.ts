import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { item, mockWorkOrder, order, scene } from './fixtures/content-work-orders'

test('正文对照下载实际原文件字节，不从当前候选重新拼接', async ({ adminApi, page }) => {
  const requests = await mockWorkOrder(page)
  const originalBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x41, 0x42])
  await page.route('**/work-orders/order/original-file', (route) =>
    route.fulfill({
      body: originalBytes,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one?section=source')
  await expect(page.locator('.original-document')).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '查看原文件', exact: true }).click()
  const download = await downloaded
  const stream = (await download.createReadStream())!
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks)).toEqual(originalBytes)
  expect(download.suggestedFilename()).toBe('original.docx')
  expect(requests.some((row) => row.method !== 'GET')).toBe(false)
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('短文主入口保持纯全文编辑，原文仅在明确对照入口显示', async ({ adminApi, page }) => {
  const requests = await mockWorkOrder(page)
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  await expect(page.getByRole('heading', { name: '短文结构化编辑', exact: true })).toBeVisible()
  await expect(page.locator('.original-document')).toHaveCount(0)
  await expect(page.locator('.short-reading-fields .reading-grid')).toBeVisible()
  await expect(page.locator('.lexicon-fields')).toHaveCount(0)
  await page.getByText('编辑正文与译文', { exact: true }).click()
  await page.getByLabel('全文中文翻译', { exact: true }).fill('管理员手动修订全文。')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => requests.filter((row) => row.path.endsWith('/correction')).length).toBe(1)
  expect(requests.find((row) => row.path.endsWith('/correction'))?.body).toMatchObject({
    original_compared: false,
    resolved_issue_ids: [],
    current: { content: { translation_zh: '管理员手动修订全文。' } }
  })
  await page.getByRole('button', { name: '正文对照与配对校对', exact: true }).click()
  await expect(page.locator('.original-document')).toContainText(
    'The immutable original paragraph.'
  )
  await expect(page.locator('.short-reading-fields .metadata-summary')).toHaveCount(0)
  await expect(page.locator('.short-reading-fields input[type=file]')).toHaveCount(0)
  await expect(page.getByLabel('全文中文翻译', { exact: true })).toHaveValue('管理员手动修订全文。')
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('关键编辑后开始校对只准备真实待准备成员，接受整理不自动产生抽样', async ({
  adminApi,
  page
}) => {
  const requests = await mockWorkOrder(page)
  let version = 1
  let prepared = false
  let ready = false
  const counts = () => ({
    ...order.counts,
    total: 2,
    normal: ready ? 1 : 0,
    review_required: ready ? 0 : 1,
    published: 1,
    failed: 0
  })
  const currentOrder = () => ({ ...order, version, counts: counts() })
  const members = () => [
    {
      ...item,
      current_draft: true,
      production_status: ready ? 'normal' : prepared ? 'processing' : 'review_required',
      issues:
        ready || prepared
          ? []
          : [
              {
                id: 'prepare',
                code: 'CONTENT_PREPARATION_REQUIRED',
                message: '正文或素材尚未准备完成'
              }
            ],
      tasks:
        prepared && !ready
          ? [{ stage_id: 'prep', stage: 'AUTO_AUDIO', current: true, status: 'RUNNING' }]
          : []
    },
    {
      ...item,
      item_id: 'old-success',
      published: true,
      current_draft: false,
      production_status: 'published',
      issues: [],
      tasks: [{ stage: 'AUTO_AUDIO', current: false, status: 'SUCCEEDED' }]
    }
  ]
  await page.route('**/work-orders/order', (route) => route.fulfill({ json: currentOrder() }))
  await page.route('**/work-orders/order/items?**', (route) =>
    route.fulfill({
      json: {
        items: members(),
        total: 2,
        page: 1,
        page_size: 100,
        version,
        counts: counts(),
        collection_hash: `v${version}-${ready}`
      }
    })
  )
  await page.route('**/work-orders/order/organize', (route) => {
    requests.push({
      path: '/organize',
      method: 'POST',
      body: route.request().postDataJSON(),
      headers: route.request().headers()
    })
    prepared = true
    version++
    return route.fulfill({
      json: { command_id: 'prepare-one', status: 'RUNNING', work_order_id: 'order', version }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order')
  const start = page.getByRole('button', { name: '开始校对', exact: true })
  await expect(start).toBeEnabled()
  await start.click()
  await expect.poll(() => requests.filter((row) => row.path.endsWith('/organize')).length).toBe(1)
  expect(requests.find((row) => row.path.endsWith('/organize'))?.body).toEqual({
    expected_version: 1,
    scope: 'selected',
    selected_item_ids: ['one'],
    include_recommendations: false
  })
  expect(requests.some((row) => row.path.endsWith('/sampling') && row.method === 'POST')).toBe(
    false
  )
  await expect(start).toBeDisabled()
  ready = true
  await page.getByRole('button', { name: '刷新进度', exact: true }).click()
  await expect(start).toBeEnabled()
  await start.click()
  await expect(page).toHaveURL(/view=sampling/)
  expect(requests.filter((row) => row.path.endsWith('/organize'))).toHaveLength(1)
  expect(adminApi.unexpectedRequests).toEqual([])
})

for (const normalCount of [0, 1]) {
  test(`已发布内容的新草稿必要准备不被生命周期排除，混合正常成员${normalCount}仍先准备`, async ({
    adminApi,
    page
  }) => {
    const requests = await mockWorkOrder(page)
    const counts = {
      ...order.counts,
      total: 2 + normalCount,
      normal: normalCount,
      review_required: 1,
      published: 2,
      failed: 0
    }
    const preparationIssue = {
      id: 'prepare-new-draft',
      code: 'CONTENT_PREPARATION_REQUIRED',
      message: '新草稿正文或素材尚未准备完成'
    }
    await page.route('**/work-orders/order', (route) =>
      route.fulfill({ json: { ...order, counts } })
    )
    await page.route('**/work-orders/order/items?**', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              ...item,
              lifecycle_status: 'PUBLISHED',
              published: true,
              current_draft: true,
              production_status: 'review_required',
              issues: [preparationIssue],
              tasks: [{ stage: 'AUTO_AUDIO', current: false, status: 'SUCCEEDED' }]
            },
            {
              ...item,
              item_id: 'unchanged-published',
              lifecycle_status: 'PUBLISHED',
              published: true,
              current_draft: true,
              production_status: 'published',
              issues: [preparationIssue]
            },
            ...(normalCount
              ? [
                  {
                    ...item,
                    item_id: 'normal-other',
                    current_draft: true,
                    production_status: 'normal',
                    issues: []
                  }
                ]
              : [])
          ],
          total: counts.total,
          counts,
          page: 1,
          page_size: 100,
          version: 1,
          collection_hash: 'published-lifecycle-new-draft'
        }
      })
    )
    await page.route('**/work-orders/order/organize', (route) => {
      requests.push({
        path: '/organize',
        method: 'POST',
        body: route.request().postDataJSON(),
        headers: route.request().headers()
      })
      return route.fulfill({
        json: {
          command_id: 'prepare-new-draft',
          status: 'RUNNING',
          work_order_id: 'order',
          version: 1
        }
      })
    })
    await loginAsAdmin(page)
    await navigateInApp(page, '/content/work-orders/order')
    const start = page.getByRole('button', { name: '开始校对', exact: true })
    await expect(start).toBeEnabled()
    await start.click()
    await expect.poll(() => requests.filter((row) => row.path.endsWith('/organize')).length).toBe(1)
    expect(
      requests
        .filter((row) => row.method === 'POST')
        .map((row) => ({ path: row.path, body: row.body }))
    ).toEqual([
      {
        path: '/organize',
        body: {
          expected_version: 1,
          scope: 'selected',
          selected_item_ids: ['one'],
          include_recommendations: false
        }
      }
    ])
    await expect(page).not.toHaveURL(/view=sampling/)
    expect(adminApi.unexpectedRequests).toEqual([])
  })
}

test('场景词汇资料入口只编辑本篇稳定词条且不自动确认原文', async ({ adminApi, page }) => {
  const content = {
    ...structuredClone(scene),
    chunks: [{ ...scene.vocabulary[0], entry_id: 'chunk-one', english: 'would you like' }]
  }
  const requests = await mockWorkOrder(page, { template: 'dialogue', content })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=entries')
  await expect(page.getByRole('heading', { name: '场景词汇与语块资料', exact: true })).toBeVisible()
  await expect(page.locator('.original-document')).toHaveCount(0)
  await expect(page.locator('.dialogue-fields')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '上传 / 替换学习图片', exact: true })).toHaveCount(
    0
  )
  const chunks = page.locator('.lexicon-fields').last()
  await expect(chunks).toContainText('语块不配置图片')
  await expect(chunks.locator('input[type=file][accept*="image"]')).toHaveCount(0)
  await chunks.getByText('编辑文字资料', { exact: true }).click()
  await chunks.getByLabel('chunk 中文 1', { exact: true }).fill('您想要')
  await page.getByRole('button', { name: '保存候选资料', exact: true }).click()
  await expect.poll(() => requests.filter((row) => row.path.endsWith('/correction')).length).toBe(1)
  expect(requests.find((row) => row.path.endsWith('/correction'))?.body).toMatchObject({
    expected_revision_id: 'revision',
    expected_edit_version: 1,
    candidate_hash: item.candidate_hash,
    original_compared: false,
    resolved_issue_ids: [],
    current: {
      content: { chunks: [{ entry_id: 'chunk-one', chinese: '您想要', icon_asset_id: null }] }
    }
  })
  expect(adminApi.unexpectedRequests).toEqual([])
})

for (const obstacle of [
  'pending',
  'unknown',
  'failed-unknown',
  'incomplete',
  'action-missing'
] as const) {
  test(`必要准备遇到${obstacle}不创建新的整理或抽样`, async ({ adminApi, page }) => {
    const requests = await mockWorkOrder(page)
    const counts = {
      ...order.counts,
      total: obstacle === 'incomplete' ? 2 : 1,
      normal: 0,
      review_required: 1,
      failed: 0
    }
    await page.route('**/work-orders/order', (route) =>
      route.fulfill({
        json: {
          ...order,
          counts,
          available_actions: obstacle === 'action-missing' ? ['sampling'] : order.available_actions,
          pending_commands:
            obstacle === 'pending'
              ? [{ command_id: 'original-unknown', action: 'organize', status: 'UNKNOWN' }]
              : []
        }
      })
    )
    await page.route('**/work-orders/order/items?**', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              ...item,
              current_draft: true,
              issues: [
                {
                  id: 'prepare',
                  code: 'CONTENT_PREPARATION_REQUIRED',
                  message: '正文或素材尚未准备完成'
                }
              ],
              tasks:
                obstacle === 'unknown' || obstacle === 'failed-unknown'
                  ? [
                      {
                        stage_id: 'old-stage',
                        stage: 'AUTO_AUDIO',
                        current: true,
                        status: obstacle === 'unknown' ? 'UNKNOWN' : 'FAILED',
                        error_code: 'PROVIDER_OUTCOME_UNKNOWN'
                      }
                    ]
                  : []
            }
          ],
          counts,
          total: counts.total,
          page: 1,
          page_size: 100,
          version: 1,
          collection_hash: 'frozen'
        }
      })
    )
    await loginAsAdmin(page)
    await navigateInApp(page, '/content/work-orders/order')
    await expect(page.getByRole('button', { name: '开始校对', exact: true })).toBeDisabled()
    await expect(page.getByRole('heading', { name: '自动整理结果', exact: true })).toBeVisible()
    expect(
      requests.some((row) => row.method === 'POST' && /\/(organize|sampling)$/.test(row.path))
    ).toBe(false)
    expect(adminApi.unexpectedRequests).toEqual([])
  })
}

test('原词汇卡主入口不要求空对话，来源校对保持主体词条和显式问题确认', async ({
  adminApi,
  page
}) => {
  const content = { ...structuredClone(scene), template_type: 'word_card', dialogue: [] }
  const requests = await mockWorkOrder(page, { template: 'word_card', content })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  await expect(page.getByRole('heading', { name: '原词汇卡资料', exact: true })).toBeVisible()
  await expect(page.locator('.dialogue-fields')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '整段音频、句子边界与切片', exact: true })
  ).toHaveCount(0)
  await page.getByRole('button', { name: '保存候选资料', exact: true }).click()
  await expect.poll(() => requests.filter((row) => row.path.endsWith('/correction')).length).toBe(1)
  expect(requests.find((row) => row.path.endsWith('/correction'))?.body).toMatchObject({
    original_compared: false,
    resolved_issue_ids: [],
    current: {
      template: 'word_card',
      content: { dialogue: [], vocabulary: [{ entry_id: 'local-latte' }] }
    }
  })
  await page.route('**/work-orders/order/items/one', (route) =>
    route.fulfill({
      json: {
        ...item,
        edit_version: 2,
        current: { template: 'word_card', content },
        issues: [
          {
            id: 'word-source',
            message: '词条来源待核对',
            acknowledgement_eligible: true,
            location: ['vocabulary', '0', 'chinese']
          }
        ]
      }
    })
  )
  await page.getByRole('button', { name: '正文对照与配对校对', exact: true }).click()
  await expect(page.locator('.original-document')).toContainText(
    'The immutable original paragraph.'
  )
  await expect(page.locator('.lexicon-fields').first()).toContainText('latte')
  await expect(page.locator('.dialogue-fields')).toHaveCount(0)
  await page
    .locator('.el-checkbox')
    .filter({ hasText: '已对照不可变原文，核对本篇词条与来源' })
    .click()
  await page.locator('.el-checkbox').filter({ hasText: '已处理：词条来源待核对' }).click()
  await page.getByRole('button', { name: '保存候选资料', exact: true }).click()
  await expect.poll(() => requests.filter((row) => row.path.endsWith('/correction')).length).toBe(2)
  expect(requests.filter((row) => row.path.endsWith('/correction')).at(-1)?.body).toMatchObject({
    original_compared: true,
    resolved_issue_ids: ['word-source'],
    expected_edit_version: 2,
    current: {
      template: 'word_card',
      content: { dialogue: [], vocabulary: [{ entry_id: 'local-latte' }] }
    }
  })
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('正文配对只选择保留中文段落，保存保留原文与句子身份', async ({ adminApi, page }) => {
  const requests = await mockWorkOrder(page, {
    template: 'dialogue',
    content: structuredClone(scene)
  })
  const original = {
    blocks: [
      { id: 'en-2', role: 'english', text: 'What would you like?', paragraph_index: 2 },
      { id: 'zh-4', role: 'chinese', text: '请问您想要什么？', paragraph_index: 4 },
      {
        id: 'metadata-5',
        role: 'metadata:source',
        text: '不能把来源说明当译文',
        paragraph_index: 5
      }
    ]
  }
  let current = structuredClone(scene)
  await page.route('**/work-orders/order/items/one', (route) =>
    route.fulfill({
      json: {
        ...item,
        content_id: 'SCENE-1',
        source_snapshot: original,
        current: { template: 'dialogue', content: current },
        issues: [
          {
            id: 'pair-issue',
            message: '中文配对待核对',
            acknowledgement_eligible: true,
            location: ['dialogue', '0', 'chinese']
          }
        ]
      }
    })
  )
  await page.route('**/work-orders/order/items/one/correction', (route) => {
    const body = route.request().postDataJSON()
    current = body.current.content
    requests.push({ path: '/correction', method: 'PUT', body, headers: route.request().headers() })
    return route.fulfill({ json: { status: 'SUCCEEDED', version: 1 } })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one?section=content')
  await expect(page.locator('.original-document')).toContainText('第 4 段')
  await expect(page.locator('.lexicon-fields')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '上传 / 替换封面', exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: '选择对应中文段落 1', exact: true }).press('Enter')
  await expect(page.getByRole('option', { name: /不能把来源说明当译文/ })).toHaveCount(0)
  await page.getByRole('option', { name: /第 4 段 · 请问您想要什么/ }).click()
  await page.getByRole('button', { name: '确认此处配对', exact: true }).click()
  await expect(page.getByLabel('中文翻译 1', { exact: true })).toHaveValue('请问您想要什么？')
  await page
    .locator('.el-checkbox')
    .filter({ hasText: '已对照不可变原文，核对本次正文与配对' })
    .click()
  await page.locator('.el-checkbox').filter({ hasText: '已处理：中文配对待核对' }).click()
  await page.getByRole('button', { name: '保存配对结果', exact: true }).click()
  await expect.poll(() => requests.filter((row) => row.path.endsWith('/correction')).length).toBe(1)
  expect(requests.find((row) => row.path.endsWith('/correction'))?.body).toMatchObject({
    original_compared: true,
    resolved_issue_ids: ['pair-issue'],
    expected_revision_id: 'revision',
    candidate_hash: item.candidate_hash,
    current: { content: { dialogue: [{ id: 'SENTENCE-1', chinese: '请问您想要什么？' }] } }
  })
  await expect(page.locator('.original-document')).toContainText('请问您想要什么？')
  await expect(page.locator('.original-document')).toContainText('不能把来源说明当译文')
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('短文预览在手机和平板宽度显示当前输入且不写学习或发布状态', async ({
  adminApi,
  page
}, testInfo) => {
  const requests = await mockWorkOrder(page)
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  await expect(page.locator('.short-reading-fields')).toBeVisible()
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 }
  ]) {
    await page.setViewportSize(viewport)
    await page.screenshot({
      path: testInfo.outputPath(`a30-${viewport.width}.png`),
      fullPage: true,
      animations: 'disabled'
    })
  }
  await page.getByRole('button', { name: '手机 / 平板预览', exact: true }).click()
  const preview = page.locator('.short-reading-preview')
  await expect(preview).toContainText('The current English paragraph.')
  expect((await preview.boundingBox())!.width).toBeLessThanOrEqual(420)
  await page.screenshot({
    path: testInfo.outputPath('a30-phone-preview.png'),
    fullPage: true,
    animations: 'disabled'
  })
  await page.getByText('平板预览', { exact: true }).click()
  expect((await preview.boundingBox())!.width).toBeGreaterThan(600)
  await page.screenshot({
    path: testInfo.outputPath('a30-tablet-preview.png'),
    fullPage: true,
    animations: 'disabled'
  })
  expect(requests.some((row) => row.method !== 'GET')).toBe(false)
  expect(adminApi.unexpectedRequests).toEqual([])
})

for (const section of ['source', 'entries'] as const) {
  test(`场景${section}职责桌面与设备预览保持当前候选`, async ({ adminApi, page }, testInfo) => {
    const requests = await mockWorkOrder(page, {
      template: 'dialogue',
      content: structuredClone(scene)
    })
    await page.route('**/work-orders/order/items/one', (route) =>
      route.fulfill({
        json: {
          ...item,
          title_en: scene.title_en,
          title_zh: scene.title_zh,
          content_id: 'SCENE-1',
          current: { template: 'dialogue', content: structuredClone(scene) },
          source_snapshot: {
            blocks: [
              {
                id: 'english-2',
                role: 'english',
                paragraph_index: 2,
                text: scene.dialogue[0]!.english
              },
              {
                id: 'chinese-4',
                role: 'chinese',
                paragraph_index: 4,
                text: scene.dialogue[0]!.chinese
              }
            ]
          },
          issues: []
        }
      })
    )
    await loginAsAdmin(page)
    await navigateInApp(page, `/content/work-orders/order/items/one?section=${section}`)
    await expect(
      page.locator(section === 'source' ? '.scene-pairing-panel' : '.scene-proofread-panel')
    ).toBeVisible()
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 }
    ]) {
      await page.setViewportSize(viewport)
      await page.screenshot({
        path: testInfo.outputPath(`${section}-${viewport.width}.png`),
        fullPage: true,
        animations: 'disabled'
      })
    }
    await page.getByRole('button', { name: '手机 / 平板预览', exact: true }).click()
    await expect(page.locator('.device-frame')).toHaveClass(/phone/)
    await page.screenshot({
      path: testInfo.outputPath(`${section}-phone-preview.png`),
      fullPage: true,
      animations: 'disabled'
    })
    await page.getByText('平板预览', { exact: true }).click()
    await expect(page.locator('.device-frame')).toHaveClass(/tablet/)
    await page.screenshot({
      path: testInfo.outputPath(`${section}-tablet-preview.png`),
      fullPage: true,
      animations: 'disabled'
    })
    expect(requests.some((row) => row.method !== 'GET')).toBe(false)
    expect(adminApi.unexpectedRequests).toEqual([])
  })
}
