import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

const targetPage = {
  items: [
    {
      id: 'SCENE-1',
      title_zh: '点一杯咖啡',
      title_en: 'Ordering coffee',
      draft_revision_id: 'REV-DRAFT-1',
      content_type: 'dialogue',
      status: 'DRAFT'
    }
  ],
  total: 1,
  page: 1,
  page_size: 100
}

test('两种入口保持一次分类选择且短文不显示词汇图包模块', async ({ adminApi, page }) => {
  void adminApi
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import?series_id=SERIES-1&content_type=dialogue')
  await page.getByRole('button', { name: '添加音频或图片', exact: true }).click()
  await expect(page).toHaveURL(/source=materials/)
  await expect(page.getByRole('heading', { name: '素材匹配', exact: true, level: 1 })).toBeVisible()
  await expect(page.getByLabel('词汇图包导入步骤')).toHaveCount(0)
  await page.getByRole('button', { name: '返回批量导入', exact: true }).click()
  await page.getByRole('button', { name: '导入词汇图包', exact: true }).click()
  await expect(page).toHaveURL(/source=vocabulary/)
  await expect(page).toHaveURL(/series_id=SERIES-1/)
  await expect(page.getByLabel('词汇图包导入步骤')).toBeVisible()
  await expect(page.getByRole('combobox', { name: '素材目标分类' })).toHaveCount(0)
  await navigateInApp(page, '/content/import?series_id=SERIES-1&content_type=short_reading')
  await expect(page.getByRole('button', { name: '导入词汇图包', exact: true })).toHaveCount(0)
})

for (const selection of [
  { source: 'materials', stage: 'SUCCESS', key: 'failed-key', conflict: true },
  { source: 'materials', stage: 'FAILED', key: 'success-key', conflict: true },
  { source: 'materials', stage: 'SUCCESS', key: 'success-key', conflict: false },
  { source: 'materials', stage: 'FAILED', key: 'failed-key', conflict: false },
  { source: 'vocabulary', stage: 'SUCCESS', key: 'failed-key', conflict: true },
  { source: 'vocabulary', stage: 'FAILED', key: 'success-key', conflict: true },
  { source: 'vocabulary', stage: 'SUCCESS', key: 'success-key', conflict: false },
  { source: 'vocabulary', stage: 'FAILED', key: 'failed-key', conflict: false }
]) {
  test(`I2 双身份恢复 ${selection.source} ${selection.stage}/${selection.key} ${selection.conflict ? '冲突保持未知' : '一致精确恢复'}`, async ({
    adminApi,
    page
  }, testInfo) => {
    let posts = 0
    await page.route('**/api/v1/admin/content-materials/DUAL-RECEIPTS**', (route) => {
      if (route.request().method() === 'POST') {
        posts++
        return route.abort()
      }
      return route.fulfill({
        json: {
          batch_id: 'DUAL-RECEIPTS',
          status: 'BOUND',
          input_hash: 'c'.repeat(64),
          series_id: 'SERIES-1',
          content_type: 'word_card',
          manifest: {
            has_vocabulary_table: selection.source === 'vocabulary',
            vocabulary_rows:
              selection.source === 'vocabulary'
                ? ['SUCCESS-ENTRY', 'FAILED-ENTRY'].map((id, index) => ({
                    row_no: index + 2,
                    import_entry_id: id,
                    entry_type: 'word',
                    english: index ? 'coffee' : 'bank',
                    meaning_zh: index ? '咖啡' : '河岸',
                    image_path: 'word.png',
                    pronunciation_path: '',
                    operation: 'CREATE',
                    issues: []
                  }))
                : [],
            resources: [
              {
                path: 'word.png',
                sha256: 'd'.repeat(64),
                allowed_roles: ['WORD_IMAGE'],
                ambiguous_title: false,
                matching_candidates: []
              }
            ],
            binding_requests: {
              SUCCESS: {
                key: 'success-key',
                request: {
                  revision_id: 'SUCCESS-REV',
                  expected_version: 3,
                  bindings:
                    selection.source === 'vocabulary'
                      ? []
                      : [{ path: 'word.png', role: 'WORD_IMAGE', entry_id: 'SUCCESS-ENTRY' }],
                  ...(selection.source === 'vocabulary'
                    ? {
                        vocabulary_preview_hash: 'e'.repeat(64),
                        vocabulary_selections: [
                          {
                            import_entry_id: 'SUCCESS-ENTRY',
                            no_image_confirmed: false,
                            difference_confirmed: false
                          }
                        ]
                      }
                    : {})
                }
              },
              FAILED: {
                key: 'failed-key',
                request: {
                  revision_id: 'FAILED-REV',
                  expected_version: 7,
                  bindings:
                    selection.source === 'vocabulary'
                      ? []
                      : [{ path: 'word.png', role: 'WORD_IMAGE', entry_id: 'FAILED-ENTRY' }],
                  ...(selection.source === 'vocabulary'
                    ? {
                        vocabulary_preview_hash: 'e'.repeat(64),
                        vocabulary_selections: [
                          {
                            import_entry_id: 'FAILED-ENTRY',
                            no_image_confirmed: false,
                            difference_confirmed: false
                          }
                        ]
                      }
                    : {})
                }
              }
            },
            binding_results: {
              SUCCESS: {
                status: 'BOUND',
                revision_id: 'SUCCESS-REV',
                edit_version: 4,
                ...(selection.source === 'vocabulary'
                  ? {
                      vocabulary_results: [
                        {
                          import_entry_id: 'SUCCESS-ENTRY',
                          entry_id: 'WORD-SAVED',
                          status: 'CREATED'
                        }
                      ]
                    }
                  : {})
              }
            },
            binding_errors: { FAILED: { error_code: 'MATERIAL_IMAGE_INVALID' } }
          }
        }
      })
    })
    await loginAsAdmin(page)
    const path = `/content/import?source=${selection.source}&series_id=SERIES-1&content_type=word_card&material_batch_id=DUAL-RECEIPTS&material_stage_id=${selection.stage}&material_bind_key=${selection.key}&material_phase=result`
    await navigateInApp(page, path)
    if (selection.conflict) {
      await expect(page.getByText('已完成', { exact: true })).toHaveCount(0)
      await expect(page.getByText(/绑定恢复身份冲突/)).toBeVisible()
      await expect(page.locator('.result-card .result-status')).toHaveText('结果待核实')
      await expect(page.locator('.result-card h2')).toHaveText('尚未确认本次绑定结果')
      await expect(page.locator('.result-card')).not.toContainText('导入任务已提交')
      await expect(page.locator('.result-card')).not.toContainText('尚未完成绑定')
      await expect(page.getByText('SUCCESS-ENTRY', { exact: true })).toHaveCount(0)
      await expect(page.getByText('FAILED-ENTRY', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: '重试本次失败绑定', exact: true })).toHaveCount(
        0
      )
      await expect(page.getByRole('button', { name: '续办原绑定', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: '继续本批校对', exact: true })).toHaveCount(0)
      await expect(page).toHaveURL(new URL(path, page.url()).href)
      await page.getByRole('button', { name: '刷新导入结果', exact: true }).click()
      await expect(page.getByText(/绑定恢复身份冲突/)).toBeVisible()
      await expect(page).toHaveURL(new URL(path, page.url()).href)
      await page.reload()
      await expect(page.getByText(/绑定恢复身份冲突/)).toBeVisible()
      await expect(page).toHaveURL(new URL(path, page.url()).href)
    } else if (selection.stage === 'SUCCESS') {
      await expect(page.getByText('已完成', { exact: true })).toBeVisible()
      await expect(page.getByText('SUCCESS-ENTRY', { exact: true })).toBeVisible()
      if (selection.source === 'vocabulary')
        await expect(
          page.getByRole('heading', { name: '1 条词汇资料已保存', exact: true })
        ).toBeVisible()
      await expect(page.getByRole('button', { name: '重试本次失败绑定', exact: true })).toHaveCount(
        0
      )
    } else {
      await expect(page.getByText('已完成', { exact: true })).toHaveCount(0)
      await expect(page.getByText('FAILED-ENTRY', { exact: true })).toBeVisible()
      await expect(page.getByText(/当前导入失败：MATERIAL_IMAGE_INVALID/)).toBeVisible()
      await expect(
        page.getByRole('button', { name: '重试本次失败绑定', exact: true })
      ).toBeEnabled()
    }
    if (selection.source === 'vocabulary') {
      await expect(
        page.getByRole('heading', { name: '词汇图包已导入', exact: true, level: 1 })
      ).toHaveCount(0)
      await expect(
        page.getByRole('heading', {
          name: '词汇图包导入结果',
          exact: true,
          level: 1
        })
      ).toBeVisible()
      await expect(page.getByText(/该包未包含词汇表.xlsx/)).toHaveCount(0)
      if (selection.stage === 'SUCCESS') {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.locator('.page-scrollbar-wrap').evaluate((node) => {
          node.scrollTop = 0
        })
        await page.screenshot({
          animations: 'disabled',
          path: testInfo.outputPath(
            `task8-vocabulary-${selection.conflict ? 'conflict' : 'success'}.png`
          )
        })
      }
    }
    expect(posts).toBe(0)
    expect(adminApi.unexpectedRequests).toEqual([])
  })
}

test('B1 词汇待处理回执不由导航阶段声称执行或完成', async ({ adminApi, page }) => {
  let posts = 0
  await page.route('**/api/v1/admin/content-materials/VOCAB-PENDING**', (route) => {
    if (route.request().method() === 'POST') {
      posts++
      return route.abort()
    }
    return route.fulfill({
      json: {
        batch_id: 'VOCAB-PENDING',
        status: 'PENDING',
        input_hash: 'c'.repeat(64),
        series_id: 'SERIES-1',
        content_type: 'word_card',
        manifest: {
          has_vocabulary_table: true,
          vocabulary_rows: [
            {
              row_no: 2,
              import_entry_id: 'PENDING-WORD',
              entry_type: 'word',
              english: 'bank',
              meaning_zh: '河岸',
              image_path: '',
              pronunciation_path: '',
              operation: 'CREATE',
              issues: []
            }
          ],
          resources: [],
          binding_requests: {
            PENDING: {
              key: 'pending-key',
              request: {
                revision_id: 'PENDING-REV',
                expected_version: 3,
                bindings: [],
                vocabulary_preview_hash: 'e'.repeat(64),
                vocabulary_selections: [
                  {
                    import_entry_id: 'PENDING-WORD',
                    no_image_confirmed: true,
                    difference_confirmed: false
                  }
                ]
              }
            }
          },
          binding_results: {},
          binding_errors: {}
        }
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(
    page,
    '/content/import?source=vocabulary&material_batch_id=VOCAB-PENDING&material_stage_id=PENDING&material_bind_key=pending-key&material_phase=result'
  )
  await expect(page.getByText('等待处理结果', { exact: true })).toBeVisible()
  await expect(page.getByText('PENDING-WORD', { exact: true })).toBeVisible()
  await expect(page.locator('.result-card .result-status')).toHaveText('等待处理结果')
  await expect(page.locator('.result-card h2')).toHaveText('导入任务已提交，等待实际绑定结果')
  await expect(page.locator('.result-card')).not.toContainText('尚未完成绑定')
  await expect(page.getByText('已完成', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /已导入|处理中/, level: 1 })).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: '词汇图包导入结果', exact: true, level: 1 })
  ).toBeVisible()
  await expect(page).toHaveURL(/material_phase=processing/)
  await expect(page).toHaveURL(/material_stage_id=PENDING/)
  await expect(page).toHaveURL(/material_bind_key=pending-key/)
  await expect(page.getByRole('button', { name: '重试本次失败绑定', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '续办原绑定', exact: true })).toHaveCount(0)
  expect(posts).toBe(0)
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('丢失回执按原幂等键恢复，旧成功阶段不被其他失败或最新阶段替代', async ({ adminApi, page }) => {
  let posts = 0
  await page.route('**/api/v1/admin/content-materials/RECEIPTS**', (route) => {
    if (route.request().method() === 'POST') {
      posts++
      return route.abort()
    }
    return route.fulfill({
      json: {
        batch_id: 'RECEIPTS',
        status: 'BOUND',
        input_hash: 'c'.repeat(64),
        series_id: 'SERIES-1',
        content_type: 'word_card',
        manifest: {
          vocabulary_rows: [],
          resources: [
            {
              path: 'unselected.png',
              sha256: 'd'.repeat(64),
              allowed_roles: ['WORD_IMAGE'],
              ambiguous_title: false,
              matching_candidates: []
            },
            {
              path: 'selected.png',
              sha256: 'e'.repeat(64),
              allowed_roles: ['WORD_IMAGE'],
              ambiguous_title: false,
              matching_candidates: []
            }
          ],
          binding_requests: {
            'EXACT-STAGE': {
              key: 'original-lost-key',
              request: {
                revision_id: 'EXACT-REV',
                expected_version: 3,
                bindings: [{ path: 'selected.png', role: 'WORD_IMAGE', entry_id: 'EXACT-ENTRY' }],
                vocabulary_selections: []
              }
            },
            'OTHER-STAGE': {
              key: 'other-key',
              request: {
                revision_id: 'OTHER-REV',
                expected_version: 7,
                bindings: [{ path: 'unselected.png', role: 'WORD_IMAGE', entry_id: 'OTHER-ENTRY' }]
              }
            }
          },
          binding_results: {
            'EXACT-STAGE': { status: 'BOUND', revision_id: 'EXACT-REV', edit_version: 4 }
          },
          binding_errors: { 'OTHER-STAGE': { error_code: 'MATERIAL_FAILED' } }
        }
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(
    page,
    '/content/import?source=materials&series_id=WRONG&content_type=short_reading&material_batch_id=RECEIPTS&material_bind_key=original-lost-key'
  )
  await expect(page.getByText('已完成', { exact: true })).toBeVisible()
  await expect(page.getByText('EXACT-ENTRY', { exact: true })).toBeVisible()
  await expect(page.getByText('OTHER-ENTRY', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重试本次失败绑定' })).toHaveCount(0)
  await expect(page).toHaveURL(/series_id=SERIES-1/)
  await expect(page).toHaveURL(/content_type=word_card/)
  await page.reload()
  await expect(page.getByText('EXACT-ENTRY', { exact: true })).toBeVisible()
  expect(posts).toBe(0)
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('明确失败绑定仅重试冻结的原目标角色条目，成功记录不重执行', async ({ adminApi, page }) => {
  const original = {
    revision_id: 'EXACT-REV',
    expected_version: 3,
    bindings: [{ path: 'word.png', role: 'WORD_IMAGE', entry_id: 'EXACT-ENTRY' }],
    vocabulary_selections: [],
    vocabulary_preview_hash: null
  }
  const writes: { key: string; body: unknown }[] = []
  let key = 'failed-original-key',
    stage = 'FAILED-STAGE',
    completed = false
  await page.route('**/api/v1/admin/content-materials/FAILED**', (route) => {
    if (route.request().method() === 'POST') {
      key = route.request().headers()['idempotency-key'] || ''
      writes.push({ key, body: route.request().postDataJSON() })
      stage = 'RETRIED-STAGE'
      completed = true
      return route.fulfill({ json: { batch_id: 'FAILED', stage_id: stage, status: 'PENDING' } })
    }
    return route.fulfill({
      json: {
        batch_id: 'FAILED',
        status: completed ? 'BOUND' : 'PREVIEW_READY',
        input_hash: 'c'.repeat(64),
        series_id: 'SERIES-1',
        content_type: 'word_card',
        manifest: {
          has_vocabulary_table: false,
          vocabulary_rows: [],
          resources: [
            {
              path: 'word.png',
              sha256: 'd'.repeat(64),
              allowed_roles: ['WORD_IMAGE'],
              ambiguous_title: false,
              matching_candidates: []
            }
          ],
          binding_requests: { [stage]: { key, request: original } },
          binding_results: completed
            ? { [stage]: { status: 'BOUND', revision_id: 'EXACT-REV', edit_version: 4 } }
            : {},
          binding_errors: { 'FAILED-STAGE': { error_code: 'MATERIAL_IMAGE_INVALID' } }
        }
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(
    page,
    '/content/import?source=materials&material_batch_id=FAILED&material_stage_id=FAILED-STAGE'
  )
  await expect(page.getByText('已完成', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '重试本次失败绑定', exact: true }).click()
  await expect(page.getByText('已完成', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0]?.key).not.toBe('failed-original-key')
  expect(writes[0]?.body).toEqual({ ...original, manual_checked: true })
  await page.reload()
  await expect(page.getByText('已完成', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '重试本次失败绑定', exact: true })).toHaveCount(0)
  expect(writes).toHaveLength(1)
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('旧素材链接按实际空表标记恢复图包，携带batch_id不误入统一ZIP工作单', async ({
  adminApi,
  page
}) => {
  let bridges = 0
  await page.route('**/api/v1/admin/content-work-orders/from-batch**', (route) => {
    bridges++
    return route.abort()
  })
  await page.route('**/api/v1/admin/content-materials/EMPTY-TABLE', (route) =>
    route.fulfill({
      json: {
        batch_id: 'EMPTY-TABLE',
        status: 'PREVIEW_READY',
        input_hash: 'c'.repeat(64),
        series_id: 'SERIES-1',
        content_type: 'word_card',
        manifest: {
          has_vocabulary_table: true,
          resources: [],
          vocabulary_rows: [],
          binding_requests: {}
        }
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(
    page,
    '/content/import?source=materials&batch_id=EMPTY-TABLE&material_batch_id=EMPTY-TABLE&material_phase=result'
  )
  await expect(page.getByRole('heading', { name: '图包校验', exact: true, level: 1 })).toBeVisible()
  await expect(
    page.getByText('词汇表没有可导入行，请修正原 ZIP 后重新上传', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '查看合格预览', exact: true })).toBeDisabled()
  await page.reload()
  await expect(page.getByRole('heading', { name: '图包校验', exact: true, level: 1 })).toBeVisible()
  expect(bridges).toBe(0)
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('同页换批次读取新清单，迟到旧批次不覆盖当前来源', async ({ adminApi, page }) => {
  let started = false
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/admin/content-materials/LATE-A', async (route) => {
    started = true
    await gate
    return route.fulfill({
      json: {
        batch_id: 'LATE-A',
        status: 'PREVIEW_READY',
        input_hash: 'a'.repeat(64),
        series_id: 'SERIES-A',
        content_type: 'word_card',
        manifest: { has_vocabulary_table: false, vocabulary_rows: [], resources: [] }
      }
    })
  })
  await page.route('**/api/v1/admin/content-materials/CURRENT-B', (route) =>
    route.fulfill({
      json: {
        batch_id: 'CURRENT-B',
        status: 'PREVIEW_READY',
        input_hash: 'b'.repeat(64),
        series_id: 'SERIES-1',
        content_type: 'short_reading',
        manifest: { has_vocabulary_table: false, vocabulary_rows: [], resources: [] }
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import?source=materials&material_batch_id=LATE-A')
  await expect.poll(() => started).toBe(true)
  await navigateInApp(page, '/content/import?source=materials&material_batch_id=CURRENT-B')
  try {
    await expect(page.getByText(/素材批次 CURRENT-B/)).toBeVisible()
  } finally {
    release?.()
  }
  await expect(page.getByText(/素材批次 LATE-A/)).toHaveCount(0)
  await expect(page).toHaveURL(/content_type=short_reading/)
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('语块不显示图片字段或无图确认，预览只有文本与选填音频', async ({ adminApi, page }) => {
  void adminApi
  const chunk = {
    row_no: 2,
    import_entry_id: 'chunk-only',
    entry_type: 'chunk',
    english: 'a small favor',
    meaning_zh: '一个小忙',
    image_path: '',
    pronunciation_path: '',
    operation: 'CREATE',
    issues: []
  }
  await page.route('**/api/v1/admin/content/catalogue?**', (route) =>
    route.fulfill({ json: targetPage })
  )
  await page.route('**/api/v1/admin/content-materials/CHUNK**', (route) =>
    route.fulfill({
      json: route.request().url().includes('vocabulary-preview')
        ? {
            revision_id: 'REV-DRAFT-1',
            expected_version: 3,
            preview_hash: 'e'.repeat(64),
            vocabulary_rows: [chunk]
          }
        : {
            batch_id: 'CHUNK',
            status: 'PREVIEW_READY',
            input_hash: 'c'.repeat(64),
            series_id: 'SERIES-1',
            content_type: 'dialogue',
            manifest: { has_vocabulary_table: true, resources: [], vocabulary_rows: [chunk] }
          }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import?source=vocabulary&material_batch_id=CHUNK')
  await page.getByRole('button', { name: '加载本页目标草稿', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '素材目标草稿', exact: true })).toBeEnabled()
  await page.getByRole('combobox', { name: '素材目标草稿', exact: true }).press('Enter')
  await page.getByRole('option', { name: /点一杯咖啡 · REV-DRAFT-1/ }).click()
  await page.getByRole('button', { name: '读取固定草稿', exact: true }).click()
  await page.getByRole('checkbox', { name: '选择词汇 chunk-only' }).locator('..').click()
  await expect(page.getByRole('checkbox', { name: '明确确认无图' })).toHaveCount(0)
  await page.getByRole('button', { name: '查看合格预览', exact: true }).click()
  const chunks = page.getByLabel('语块资料预览')
  await expect(chunks.getByText('a small favor', { exact: true })).toBeVisible()
  await expect(chunks.getByRole('columnheader', { name: /图片/ })).toHaveCount(0)
  await expect(chunks.getByText('无图已确认', { exact: true })).toHaveCount(0)
})

test('素材匹配按完整上传清单计数并保留人工候选，固定版本缺音频范围可见', async ({
  adminApi,
  page
}, testInfo) => {
  void adminApi
  const candidate = { revision_id: 'REV-DRAFT-1', edit_version: 3, title_en: 'Ordering coffee' }
  const resources = [
    {
      path: 'Ordering coffee.mp3',
      kind: 'audio',
      filename: 'Ordering coffee.mp3',
      sha256: 'a'.repeat(64),
      allowed_roles: ['WHOLE_AUDIO', 'WORD_AUDIO', 'CHUNK_AUDIO'],
      matching_candidate_count: 1,
      ambiguous_title: false,
      matching_candidates: [candidate]
    },
    {
      path: 'Bank.m4a',
      kind: 'audio',
      filename: 'Bank.m4a',
      sha256: 'b'.repeat(64),
      allowed_roles: ['WHOLE_AUDIO', 'WORD_AUDIO', 'CHUNK_AUDIO'],
      matching_candidate_count: 2,
      ambiguous_title: true,
      matching_candidates: [
        { ...candidate, title_en: 'Bank' },
        { revision_id: 'REV-BANK-2', edit_version: 2, title_en: 'Bank' }
      ]
    },
    {
      path: 'optional.png',
      kind: 'images',
      filename: 'optional.png',
      sha256: 'd'.repeat(64),
      allowed_roles: ['COVER_IMAGE', 'LEARNING_IMAGE', 'WORD_IMAGE'],
      matching_candidate_count: 0,
      ambiguous_title: false,
      matching_candidates: []
    }
  ]
  await page.route('**/api/v1/admin/content/catalogue?**', (route) =>
    route.fulfill({ json: targetPage })
  )
  await page.route('**/api/v1/admin/content-materials/MATCHING', (route) =>
    route.fulfill({
      json: {
        batch_id: 'MATCHING',
        status: 'PREVIEW_READY',
        input_hash: 'c'.repeat(64),
        series_id: 'SERIES-1',
        content_type: 'dialogue',
        manifest: { has_vocabulary_table: false, vocabulary_rows: [], resources }
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import?source=materials&material_batch_id=MATCHING')
  const metrics = page.getByLabel('实际素材匹配统计')
  await expect(metrics.locator('article').nth(0).locator('strong')).toHaveText('1')
  await expect(metrics.locator('article').nth(1).locator('strong')).toHaveText('1')
  await expect(metrics.locator('article').nth(2).locator('strong')).toHaveText('待核对')
  await expect(metrics.locator('article').nth(3).locator('strong')).toHaveText('0')
  await expect(page.getByRole('checkbox', { name: '明确绑定这个文件' }).first()).not.toBeChecked()
  await page.getByRole('button', { name: '加载本页目标草稿', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '素材目标草稿', exact: true })).toBeEnabled()
  await page.getByRole('combobox', { name: '素材目标草稿', exact: true }).press('Enter')
  await page.getByRole('option', { name: /点一杯咖啡 · REV-DRAFT-1/ }).click()
  await page.getByRole('button', { name: '读取固定草稿', exact: true }).click()
  await expect(metrics.locator('article').nth(2).locator('strong')).toHaveText('0')
  await expect(metrics.getByText('仅当前草稿 REV-DRAFT-1', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('.page-scrollbar-wrap').evaluate((node) => {
    node.scrollTop = 0
  })
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('task5-a18m-matching.png')
  })
})

test('绑定回执迟到不能把旧阶段写入新素材批次', async ({ adminApi, page }) => {
  void adminApi
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/admin/content/catalogue?**', (route) =>
    route.fulfill({ json: targetPage })
  )
  await page.route('**/api/v1/admin/content-materials/POST-A**', async (route) => {
    if (route.request().method() === 'POST') {
      await gate
      return route.fulfill({
        json: { batch_id: 'POST-A', stage_id: 'LATE-STAGE', status: 'PENDING' }
      })
    }
    return route.fulfill({
      json: {
        batch_id: 'POST-A',
        status: 'PREVIEW_READY',
        input_hash: 'a'.repeat(64),
        series_id: 'SERIES-1',
        content_type: 'dialogue',
        manifest: {
          has_vocabulary_table: false,
          vocabulary_rows: [],
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
  await page.route('**/api/v1/admin/content-materials/POST-B', (route) =>
    route.fulfill({
      json: {
        batch_id: 'POST-B',
        status: 'PREVIEW_READY',
        input_hash: 'b'.repeat(64),
        series_id: 'SERIES-1',
        content_type: 'short_reading',
        manifest: { has_vocabulary_table: false, vocabulary_rows: [], resources: [] }
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/import?source=materials&material_batch_id=POST-A')
  await page.getByRole('button', { name: '加载本页目标草稿', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '素材目标草稿', exact: true })).toBeEnabled()
  await page.getByRole('combobox', { name: '素材目标草稿', exact: true }).press('Enter')
  await page.getByRole('option', { name: /点一杯咖啡 · REV-DRAFT-1/ }).click()
  await page.getByRole('button', { name: '读取固定草稿', exact: true }).click()
  await page.getByRole('checkbox', { name: '明确绑定这个文件' }).locator('..').click()
  await page.getByRole('combobox', { name: '素材角色 1', exact: true }).press('Enter')
  await page.getByRole('option', { name: '词汇小图', exact: true }).click()
  await page.getByRole('combobox', { name: '素材词条 1', exact: true }).press('Enter')
  await page.getByRole('option', { name: /latte/ }).click()
  await page.getByRole('button', { name: '查看合格预览', exact: true }).click()
  await page
    .getByRole('checkbox', { name: '已逐项核对文件、角色、当前草稿和稳定词条' })
    .locator('..')
    .click()
  const pending = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('/POST-A/bindings')
  )
  await page.getByRole('button', { name: '确认导入', exact: true }).click()
  await navigateInApp(page, '/content/import?source=materials&material_batch_id=POST-B')
  try {
    await expect(page.getByText(/素材批次 POST-B/)).toBeVisible()
  } finally {
    release?.()
  }
  await (await pending).finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(page).not.toHaveURL(/LATE-STAGE/)
  await expect(page.getByText('等待处理结果', { exact: true })).toHaveCount(0)
})

test('图包校验失败保留入口意图和实际错误，不用缺失清单填零', async ({ adminApi, page }) => {
  void adminApi
  await page.route('**/api/v1/admin/content-materials/VALIDATION-FAILED', (route) =>
    route.fulfill({
      json: {
        batch_id: 'VALIDATION-FAILED',
        status: 'FAILED',
        input_hash: 'c'.repeat(64),
        series_id: 'SERIES-1',
        content_type: 'word_card',
        manifest: { binding_errors: { VALIDATE: { error_code: 'MATERIAL_PACKAGE_EMPTY' } } }
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(
    page,
    '/content/import?source=vocabulary&material_batch_id=VALIDATION-FAILED&material_phase=result'
  )
  await expect(page.getByLabel('词汇图包导入步骤')).toBeVisible()
  await expect(page.getByText(/校验失败：MATERIAL_PACKAGE_EMPTY/)).toBeVisible()
  await expect(page.getByText('素材数量待校验', { exact: false })).toBeVisible()
  await expect(page.getByText(/0份素材/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '查看合格预览', exact: true })).toBeDisabled()
  await expect(page.getByText('已完成', { exact: true })).toHaveCount(0)
})
