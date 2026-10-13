import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('短文素材目标由服务端按分类类型分页，并忽略伪造的完成阶段', async ({ adminApi, page }) => {
  void adminApi
  const targetQueries: URL[] = []
  await page.route('**/api/v1/admin/content/catalogue?**', (route) => {
    const query = new URL(route.request().url())
    targetQueries.push(query)
    const scoped =
      query.searchParams.get('series_id') === 'SERIES-1' &&
      query.searchParams.get('content_type') === 'short_reading' &&
      query.searchParams.get('page') === '2'
    return route.fulfill({
      json: {
        items: scoped
          ? [
              {
                id: 'READING-OTHER-PAGE',
                title_zh: '已发布短文的候选',
                title_en: 'Candidate reading',
                draft_revision_id: 'READING-DRAFT-2',
                status: 'PUBLISHED',
                content_type: 'short_reading'
              }
            ]
          : [],
        total: 150,
        page: 2,
        page_size: 100
      }
    })
  })
  await page.route('**/api/v1/admin/content-materials/MATERIAL-READING', (route) =>
    route.fulfill({
      json: {
        batch_id: 'MATERIAL-READING',
        status: 'PREVIEW_READY',
        input_hash: 'c'.repeat(64),
        manifest: { resources: [] }
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(
    page,
    '/content/import?source=materials&content_type=short_reading&series_id=SERIES-1&material_phase=result'
  )
  await expect(
    page.getByRole('heading', { name: '上传词汇图包', exact: true, level: 1 })
  ).toBeVisible()
  const panel = page.locator('.content-materials-panel')
  await expect(panel.getByText('已完成', { exact: true })).toHaveCount(0)
  await panel.getByLabel('素材批次编号').fill('MATERIAL-READING')
  await panel.getByRole('button', { name: '恢复 / 刷新素材结果', exact: true }).click()
  await panel.getByRole('spinbutton', { name: '素材草稿页码' }).fill('2')
  await panel.getByRole('button', { name: '加载本页目标草稿', exact: true }).click()
  await expect(panel.getByRole('combobox', { name: '素材目标草稿', exact: true })).toBeEnabled()
  await panel.getByRole('combobox', { name: '素材目标草稿', exact: true }).press('Enter')
  await expect(
    page.getByRole('option', { name: /已发布短文的候选 · READING-DRAFT-2/ })
  ).toBeVisible()
  expect(targetQueries.at(-1)?.searchParams.get('status')).toBeNull()
})

test('词汇图包四阶段按稳定词条确认，并等实际绑定结果后显示完成', async ({
  adminApi,
  page
}, testInfo) => {
  void adminApi
  let submitted = false,
    completed = false
  const targetQueries: URL[] = []
  await page.route('**/api/v1/admin/content/catalogue?**', (route) => {
    targetQueries.push(new URL(route.request().url()))
    return route.fulfill({
      json: {
        items: [
          {
            id: 'SCENE-1',
            title_zh: '咖啡店词汇',
            title_en: 'Coffee vocabulary',
            draft_revision_id: 'REV-DRAFT-1',
            content_type: 'word_card',
            status: 'PUBLISHED'
          },
          {
            id: 'SCENE-NO-DRAFT',
            title_zh: '已发布但暂无候选',
            draft_revision_id: null,
            content_type: 'word_card',
            status: 'PUBLISHED'
          }
        ],
        total: 2,
        page: 1,
        page_size: 100
      }
    })
  })
  await page.route('**/api/v1/admin/content-materials**', (route) => {
    if (route.request().method() === 'POST') {
      submitted = true
      return route.fulfill({
        json: { batch_id: 'MATERIAL-1', status: 'PENDING', stage_id: 'STAGE-1' }
      })
    }
    return route.fulfill({
      json: {
        batch_id: 'MATERIAL-1',
        status: completed ? 'BOUND' : 'PREVIEW_READY',
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
          ],
          binding_requests: submitted
            ? {
                'STAGE-1': {
                  request: {
                    revision_id: 'REV-DRAFT-1',
                    bindings: [{ path: 'word.png', role: 'WORD_IMAGE', entry_id: 'ENTRY-1' }]
                  }
                }
              }
            : {},
          binding_results: completed
            ? { 'STAGE-1': { status: 'BOUND', revision_id: 'REV-DRAFT-1', edit_version: 4 } }
            : {}
        }
      }
    })
  })
  await page.route('**/api/v1/admin/content-materials/MATERIAL-1/resources/preview', (route) => {
    expect(route.request().postDataJSON()).toEqual({ path: 'word.png' })
    return route.fulfill({
      json: {
        url: '/material-raw-preview.png',
        content_type: 'image/png',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        sha256: 'd'.repeat(64)
      }
    })
  })
  await page.route('**/material-raw-preview.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBTcAAAAASUVORK5CYII=',
        'base64'
      )
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import?mode=word_images')
  await page.getByRole('button', { name: '导入词汇图包', exact: true }).click()
  const panel = page.locator('.content-materials-panel')
  await expect(page.getByRole('heading', { name: '上传词汇图包', exact: true })).toBeVisible()
  await expect(panel.getByText('图文预览', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: testInfo.outputPath('word-images-upload.png') })
  await panel.getByRole('button', { name: '加载素材分类 / 草稿', exact: true }).click()
  // 键盘输入不会等待异步加载解除禁用，先确认分类选择器已可操作
  await expect(panel.getByRole('combobox', { name: '素材目标分类', exact: true })).toBeEnabled()
  await panel.getByRole('combobox', { name: '素材目标分类', exact: true }).press('Enter')
  await page.getByRole('option', { name: '日常英语', exact: true }).click()
  await panel.getByRole('combobox', { name: '素材内容模板', exact: true }).press('Enter')
  await page.getByRole('option', { name: '原词汇卡', exact: true }).click()
  await panel.getByLabel('素材批次编号').fill('MATERIAL-1')
  await panel.getByRole('button', { name: '恢复 / 刷新素材结果', exact: true }).click()
  await expect(page.getByRole('heading', { name: '图包校验', exact: true, level: 1 })).toBeVisible()
  await panel.getByRole('button', { name: '加载本页目标草稿', exact: true }).click()
  // 草稿列表异步加载时选择器禁用，键盘操作前等待加载完成
  await expect(panel.getByRole('combobox', { name: '素材目标草稿', exact: true })).toBeEnabled()
  await expect(panel.getByText(/本页 1 篇内容尚无可编辑草稿/)).toBeVisible()
  expect(targetQueries.at(-1)?.searchParams.get('series_id')).toBe('SERIES-1')
  expect(targetQueries.at(-1)?.searchParams.get('content_type')).toBe('word_card')
  expect(targetQueries.at(-1)?.searchParams.get('status')).toBeNull()
  await panel.getByRole('combobox', { name: '素材目标草稿', exact: true }).press('Enter')
  await page.getByRole('option', { name: /咖啡店词汇/ }).click()
  await panel.getByRole('button', { name: '读取固定草稿', exact: true }).click()
  await panel.locator('article .el-checkbox').click()
  await panel.getByRole('combobox', { name: '素材角色 1', exact: true }).press('Enter')
  await page.getByRole('option', { name: '词汇小图', exact: true }).click()
  await panel.getByRole('combobox', { name: '素材词条 1', exact: true }).press('Enter')
  await page.getByRole('option', { name: /latte/ }).click()
  await page.screenshot({ path: testInfo.outputPath('word-images-validation.png') })
  await page.getByRole('button', { name: '查看合格预览', exact: true }).click()
  await expect(page.getByRole('heading', { name: '图文对应预览', exact: true })).toBeVisible()
  await expect(panel.getByText('latte', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '预览此素材', exact: true }).click()
  const image = panel.getByRole('img', { name: '导入素材受控预览' })
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(1)
  await page.screenshot({ path: testInfo.outputPath('word-images-preview.png') })
  await panel
    .getByRole('checkbox', { name: '已逐项核对文件、角色、当前草稿和稳定词条' })
    .locator('..')
    .click()
  await page.getByRole('button', { name: '确认导入', exact: true }).click()
  await expect(panel.getByText('等待处理结果', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '词汇图包导入处理中', exact: true })).toBeVisible()
  await expect(panel.getByText('已完成', { exact: true })).toHaveCount(0)
  completed = true
  await page.getByRole('button', { name: '刷新导入结果', exact: true }).click()
  await expect(panel.getByText('已完成', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '词汇图包已导入', exact: true })).toBeVisible()
  await expect(panel.locator('pre')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('word-images-result.png') })
  await page.reload()
  await expect(page.getByRole('heading', { name: '词汇图包已导入', exact: true })).toBeVisible()
  await expect(panel.getByText('ENTRY-1', { exact: true })).toBeVisible()
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 760, height: 850 }
  ]) {
    await page.setViewportSize(viewport)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await expect(page.getByRole('button', { name: '导入新图包', exact: true })).toBeVisible()
  }
})

test('正式词汇表预览按导入ID确认缺图与差异，异常行不能进入范围', async ({ adminApi, page }) => {
  void adminApi
  let body: Record<string, unknown> | null = null
  const rows = [
    {
      row_no: 2,
      import_entry_id: 'word-coffee-medium',
      english: 'medium',
      meaning_zh: '中杯',
      image_path: null,
      operation: 'CREATE',
      issues: []
    },
    {
      row_no: 3,
      import_entry_id: 'word-home-medium',
      english: 'medium',
      meaning_zh: '中等的',
      image_path: null,
      operation: 'UPDATE',
      previous: { chinese: '中等' },
      issues: []
    },
    {
      row_no: 4,
      import_entry_id: 'duplicate',
      english: 'latte',
      meaning_zh: '拿铁',
      image_path: 'wrong.png',
      operation: 'CREATE',
      issues: [{ code: 'DUPLICATE_ID', severity: 'ERROR', message: '条目ID重复' }]
    }
  ]
  await page.route('**/api/v1/admin/content/catalogue?**', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'SCENE-1',
            title_zh: '词汇图包来源',
            title_en: 'Vocabulary source',
            draft_revision_id: 'REV-DRAFT-1',
            content_type: 'word_card',
            status: 'PUBLISHED'
          }
        ],
        total: 1,
        page: 1,
        page_size: 100
      }
    })
  )
  await page.route('**/api/v1/admin/content-materials**', (route) => {
    if (route.request().url().includes('/vocabulary-preview'))
      return route.fulfill({
        json: {
          batch_id: 'VOCAB-1',
          revision_id: 'REV-DRAFT-1',
          expected_version: 3,
          preview_hash: 'e'.repeat(64),
          vocabulary_rows: rows
        }
      })
    if (route.request().method() === 'POST') {
      body = route.request().postDataJSON()
      return route.fulfill({
        json: { batch_id: 'VOCAB-1', stage_id: 'VOCAB-STAGE', status: 'PENDING' }
      })
    }
    return route.fulfill({
      json: {
        batch_id: 'VOCAB-1',
        status: 'PREVIEW_READY',
        input_hash: 'c'.repeat(64),
        manifest: { resources: [], vocabulary_rows: rows }
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import')
  await page.getByRole('button', { name: '导入词汇图包', exact: true }).click()
  const panel = page.locator('.content-materials-panel')
  await panel.getByRole('button', { name: '加载素材分类 / 草稿', exact: true }).click()
  // 等待分类加载完成后再打开下拉，避免把 Enter 发给禁用控件
  await expect(panel.getByRole('combobox', { name: '素材目标分类', exact: true })).toBeEnabled()
  await panel.getByRole('combobox', { name: '素材目标分类', exact: true }).press('Enter')
  await page.getByRole('option', { name: '日常英语', exact: true }).click()
  await panel.getByRole('combobox', { name: '素材内容模板', exact: true }).press('Enter')
  await page.getByRole('option', { name: '原词汇卡', exact: true }).click()
  await panel.getByLabel('素材批次编号').fill('VOCAB-1')
  await panel.getByRole('button', { name: '恢复 / 刷新素材结果', exact: true }).click()
  await panel.getByRole('button', { name: '加载本页目标草稿', exact: true }).click()
  // press 不等待禁用控件恢复，先确认目标草稿选择器可操作
  await expect(panel.getByRole('combobox', { name: '素材目标草稿', exact: true })).toBeEnabled()
  await panel.getByRole('combobox', { name: '素材目标草稿', exact: true }).press('Enter')
  await page.getByRole('option', { name: /词汇图包来源/ }).click()
  await panel.getByRole('button', { name: '读取固定草稿', exact: true }).click()
  await expect(panel.getByRole('checkbox', { name: '选择词汇 duplicate' })).toBeDisabled()
  await panel.getByRole('checkbox', { name: '选择词汇 word-coffee-medium' }).locator('..').click()
  await panel.getByRole('checkbox', { name: '选择词汇 word-home-medium' }).locator('..').click()
  await expect(page.getByRole('button', { name: '查看合格预览' })).toBeDisabled()
  await panel.getByRole('checkbox', { name: '明确确认无图' }).nth(0).locator('..').click()
  await panel.getByRole('checkbox', { name: '明确确认无图' }).nth(1).locator('..').click()
  await page.getByRole('button', { name: '查看合格预览' }).click()
  await expect(panel.getByText('medium', { exact: true })).toHaveCount(2)
  await panel
    .getByRole('checkbox', { name: '已逐项核对文件、角色、当前草稿和稳定词条' })
    .locator('..')
    .click()
  await expect(page.getByRole('button', { name: '确认导入', exact: true })).toBeDisabled()
  await panel.getByRole('checkbox', { name: '已核对该条目变更' }).locator('..').click()
  await panel
    .getByRole('checkbox', { name: '已逐项核对文件、角色、当前草稿和稳定词条' })
    .locator('..')
    .click()
  await page.getByRole('button', { name: '确认导入', exact: true }).click()
  await expect
    .poll(() => body)
    .toMatchObject({
      revision_id: 'REV-DRAFT-1',
      expected_version: 3,
      vocabulary_preview_hash: 'e'.repeat(64),
      bindings: [],
      vocabulary_selections: [
        {
          import_entry_id: 'word-coffee-medium',
          no_image_confirmed: true,
          difference_confirmed: false
        },
        {
          import_entry_id: 'word-home-medium',
          no_image_confirmed: true,
          difference_confirmed: true
        }
      ]
    })
})
