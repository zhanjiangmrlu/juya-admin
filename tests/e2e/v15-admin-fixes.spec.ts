import { createHash } from 'node:crypto'

import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'

test('自动音频未配置显示原因并按当前草稿版本明确恢复本地阶段', async ({ adminApi, page }) => {
  let recovered = false
  let retryBody: unknown = null
  await page.route('**/api/v1/admin/content/revisions/REV-DRAFT-1/audio-production', (route) =>
    route.fulfill({
      json: {
        stage_id: 'AUTO-FAILED',
        status: recovered ? 'QUEUED' : 'FAILED',
        error_code: 'CANDIDATE_PROVIDER_UNAVAILABLE',
        candidate_id: null,
        input_hash: 'input'
      }
    })
  )
  await page.route('**/api/v1/admin/content-stages/AUTO-FAILED', (route) =>
    route.fulfill({
      json: {
        public_id: 'AUTO-FAILED',
        item_id: 'REV-DRAFT-1',
        stage: 'AUTO_AUDIO',
        status: recovered ? 'QUEUED' : 'FAILED',
        input_hash: 'input',
        config_version: 'auto-audio-v1',
        fencing_version: 2,
        attempt: 1,
        error_code: 'CANDIDATE_PROVIDER_UNAVAILABLE'
      }
    })
  )
  await page.route('**/api/v1/admin/content-stages/AUTO-FAILED/retry', (route) => {
    retryBody = route.request().postDataJSON()
    recovered = true
    return route.fulfill({ status: 202, json: { stage_id: 'AUTO-FAILED', status: 'QUEUED' } })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=audio')
  await expect(page.getByText('音文识别服务未配置，请检查服务配置后明确重试失败阶段')).toBeVisible()
  const recovery = page.locator('.content-candidates-panel .content-stage-recovery-panel')
  await expect(recovery.getByLabel('失败阶段编号')).toHaveValue('AUTO-FAILED')
  await recovery.getByRole('button', { name: '读取阶段状态' }).click()
  await expect(recovery.getByLabel('当前草稿编辑版本')).toHaveValue('3')
  await recovery.locator('.el-checkbox').filter({ hasText: '明确重试这个失败阶段' }).click()
  await expect(recovery.getByText(/已核对历史费用与预算/)).toHaveCount(0)
  await recovery.getByRole('button', { name: '恢复明确失败阶段' }).click()
  await expect
    .poll(() => retryBody)
    .toMatchObject({
      expected_edit_version: 3,
      expected_fence: 2,
      input_hash: 'input',
      config_version: 'auto-audio-v1',
      manual_confirmed: true,
      acknowledged_charged_retry: false
    })
  expect(adminApi.unexpectedRequests).toEqual([])
})

for (const copiedBoundaries of [false, true]) {
  test(
    copiedBoundaries
      ? '复用有效边界完成本地调度，无ASR候选仍正常显示实际切片待试听'
      : '自动音频恢复可靠句子映射和实际文件，保留人工试听未确认状态',
    async ({ adminApi, page }, testInfo) => {
      let version = copiedBoundaries ? 4 : 3
      const audio = {
        target_id: 'TARGET-1',
        version_id: 'VERSION-1',
        asset_id: 'ASSET-AUDIO-1',
        duration_ms: 4000
      }
      await page.route('**/api/v1/admin/content/revisions/REV-DRAFT-1', (route) =>
        route.fulfill({
          json: {
            id: 'REV-DRAFT-1',
            scene_id: 'SCENE-1',
            status: 'DRAFT',
            version,
            stable_entry_ids: [],
            stable_sentence_ids: ['SENTENCE-1'],
            content: {
              schema_version: 2,
              template_type: 'dialogue',
              title_en: 'Hello',
              title_zh: '问好',
              audio,
              dialogue: [
                {
                  id: 'SENTENCE-1',
                  english: 'Hello.',
                  chinese: '你好。',
                  start_ms: version > 3 ? 0 : null,
                  end_ms: version > 3 ? 500 : null,
                  audio_version_id: version > 3 ? 'VERSION-1' : null,
                  timing_confirmed: version > 3,
                  boundary_verified_by: 'system:asr-alignment'
                }
              ],
              vocabulary: [],
              chunks: []
            }
          }
        })
      )
      await page.route('**/api/v1/admin/content/revisions/REV-DRAFT-1/audio-production', (route) =>
        route.fulfill({
          json: {
            stage_id: 'AUTO-AUDIO-1',
            status: 'SUCCEEDED',
            error_code: null,
            candidate_id: copiedBoundaries ? null : 'ASR-1',
            input_hash: 'input'
          }
        })
      )
      await page.route(
        '**/api/v1/admin/content/revisions/REV-DRAFT-1/candidates/latest?kind=ASR_BOUNDARY',
        (route) => {
          if (copiedBoundaries)
            return route.fulfill({
              status: 404,
              json: { code: 'CANDIDATE_NOT_FOUND', request_id: 'test' }
            })
          version = 4
          return route.fulfill({
            json: {
              id: 'ASR-1',
              stale: false,
              revision_id: 'REV-DRAFT-1',
              status: 'READY',
              input_hash: 'input',
              candidate: {
                kind: 'ASR_BOUNDARY',
                edit_version: 3,
                sources: { 'SENTENCE-1': 'Hello.' },
                source_sentences: [{ sentence_id: 'SENTENCE-1', english: 'Hello.' }],
                audio: { version_id: 'VERSION-1' },
                results: {
                  text: 'Hello.',
                  boundaries: [{ start_ms: 0, end_ms: 500 }],
                  alignment_status: 'ALIGNED',
                  alignment: [
                    { sentence_id: 'SENTENCE-1', start_ms: 0, end_ms: 500, match_score: 1 }
                  ],
                  issues: [],
                  applied_edit_version: 4,
                  human_listening_confirmed: false
                }
              }
            }
          })
        }
      )
      await page.route(
        '**/api/v1/admin/content/revisions/REV-DRAFT-1/sentences/SENTENCE-1/slice-state?**',
        (route) =>
          route.fulfill({
            json: {
              revision_id: 'REV-DRAFT-1',
              sentence_id: 'SENTENCE-1',
              edit_version: Number(
                new URL(route.request().url()).searchParams.get('expected_version')
              ),
              status: 'READY_TO_LISTEN',
              dependency_hash: 'a'.repeat(64),
              target_id: 'SLICE-TARGET',
              resource_version: 'SLICE-VERSION',
              asset_id: 'SLICE-ASSET',
              duration_ms: 500,
              listening_confirmed: false
            }
          })
      )
      await page.route(
        '**/api/v1/admin/content/revisions/REV-DRAFT-1/sentences/SENTENCE-1/slice-preview?**',
        (route) =>
          route.fulfill({
            json: {
              url: '/__slice.wav',
              status: 'READY_TO_LISTEN',
              dependency_hash: 'a'.repeat(64),
              target_id: 'SLICE-TARGET',
              resource_version: 'SLICE-VERSION',
              asset_id: 'SLICE-ASSET',
              duration_ms: 500
            }
          })
      )
      await loginAsAdmin(page)
      await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=audio')
      if (copiedBoundaries) {
        await expect(page.getByText('自动音频任务：调度已完成')).toBeVisible()
        await expect(
          page.locator('.content-candidates-panel').filter({ hasText: '自动音文对齐与切片' })
        ).not.toContainText('失败')
        await expect(
          page.locator('.content-candidates-panel .content-stage-recovery-panel')
        ).toHaveCount(0)
      } else await expect(page.getByText(/自动对齐已完成，实际单句文件由服务端生成/)).toBeVisible()
      await expect(page.locator('.sentence-slices-panel')).toContainText('0 → 500')
      await expect(page.getByRole('button', { name: '试听独立文件', exact: true })).toBeEnabled()
      await expect(page.locator('.sentence-slices-panel')).not.toContainText('人工已确认')
      expect(
        adminApi.requests.some(
          (request) =>
            request.method === 'POST' &&
            /candidates|boundary-confirm|slice-confirm/.test(request.pathname)
        )
      ).toBe(false)
      await page.getByRole('button', { name: '调整边界', exact: true }).click()
      await expect(page.locator('.boundary-form input').first()).toBeFocused()
      await page.screenshot({
        path: testInfo.outputPath('automatic-audio-alignment.png'),
        fullPage: true,
        animations: 'disabled'
      })
      expect(adminApi.unexpectedRequests).toEqual([])
    }
  )
}

test('无关编辑后的同源失败ASR按当前版本明确恢复，仍要求收费确认', async ({ adminApi, page }) => {
  let retryBody: unknown = null
  await page.route('**/api/v1/admin/content/revisions/REV-DRAFT-1', (route) =>
    route.fulfill({
      json: {
        id: 'REV-DRAFT-1',
        scene_id: 'SCENE-1',
        status: 'DRAFT',
        version: 4,
        stable_entry_ids: [],
        stable_sentence_ids: ['SENTENCE-1'],
        content: {
          schema_version: 2,
          template_type: 'dialogue',
          title_zh: '仅改标题的新草稿',
          audio: {
            target_id: 'TARGET-1',
            version_id: 'VERSION-1',
            asset_id: 'ASSET-AUDIO-1',
            duration_ms: 4000
          },
          dialogue: [{ id: 'SENTENCE-1', english: 'Hello.', chinese: '更新译文' }],
          vocabulary: [],
          chunks: []
        }
      }
    })
  )
  await page.route('**/api/v1/admin/content/revisions/REV-DRAFT-1/audio-production', (route) =>
    route.fulfill({
      json: {
        stage_id: 'AUTO-AUDIO-1',
        status: 'SUCCEEDED',
        error_code: null,
        candidate_id: 'ASR-FAILED',
        input_hash: 'input'
      }
    })
  )
  await page.route(
    '**/api/v1/admin/content/revisions/REV-DRAFT-1/candidates/latest?kind=ASR_BOUNDARY',
    (route) =>
      route.fulfill({
        json: {
          id: 'ASR-FAILED',
          revision_id: 'REV-DRAFT-1',
          stale: false,
          status: 'FAILED',
          stage_id: 'ASR-STAGE-1',
          stage_status: 'FAILED',
          input_hash: 'input',
          candidate: {
            kind: 'ASR_BOUNDARY',
            edit_version: 3,
            sources: { 'SENTENCE-1': 'Hello.' },
            source_sentences: [{ sentence_id: 'SENTENCE-1', english: 'Hello.' }],
            audio: { version_id: 'VERSION-1' }
          }
        }
      })
  )
  await page.route('**/api/v1/admin/content-stages/ASR-STAGE-1', (route) =>
    route.fulfill({
      json: {
        public_id: 'ASR-STAGE-1',
        item_id: 'ASR-FAILED',
        stage: 'ASR_BOUNDARY',
        status: 'FAILED',
        input_hash: 'input',
        config_version: 'asr-v1',
        fencing_version: 2,
        attempt: 1,
        error_code: 'PROVIDER_FAILED'
      }
    })
  )
  await page.route('**/api/v1/admin/content-stages/ASR-STAGE-1/retry', (route) => {
    retryBody = route.request().postDataJSON()
    return route.fulfill({ status: 202, json: { stage_id: 'ASR-STAGE-1', status: 'QUEUED' } })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/SCENE-1/edit?stage=audio')
  const recovery = page.locator('.content-candidates-panel .content-stage-recovery-panel')
  await expect(recovery.getByLabel('失败阶段编号')).toHaveValue('ASR-STAGE-1')
  await recovery.getByRole('button', { name: '读取阶段状态' }).click()
  await expect(recovery.getByLabel('当前草稿编辑版本')).toHaveValue('4')
  await recovery.locator('.el-checkbox').filter({ hasText: '明确重试这个失败阶段' }).click()
  await expect(recovery.getByRole('button', { name: '恢复明确失败阶段' })).toBeDisabled()
  await recovery.locator('.el-checkbox').filter({ hasText: '已核对历史费用与预算' }).click()
  await recovery.getByRole('button', { name: '恢复明确失败阶段' }).click()
  await expect
    .poll(() => retryBody)
    .toMatchObject({
      expected_edit_version: 4,
      expected_fence: 2,
      manual_confirmed: true,
      acknowledged_charged_retry: true
    })
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('词卡只有词条音频时保留实际试听入口并要求显式试听勾选', async ({ adminApi, page }) => {
  const content = {
    schema_version: 2,
    template_type: 'word_card',
    title_zh: '问候词卡',
    vocabulary: [
      { audio_version_id: 'WORD-AUDIO', chinese: '你好', english: 'hello', entry_id: 'WORD-1' }
    ]
  }
  const sorted = Object.fromEntries(Object.entries(content).sort(([a], [b]) => a.localeCompare(b)))
  const hash = createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
  const collection = {
    public_id: 'WORD-SET',
    collection_hash: 'b'.repeat(64),
    status: 'PENDING',
    normal_count: 1,
    candidates: [
      {
        content_type: 'word_card',
        content_id: 'SCENE-WORD',
        revision_id: 'REV-WORD',
        candidate_hash: hash,
        normal: true,
        classification_facts: { has_audio: true }
      }
    ],
    sample_ids: ['REV-WORD'],
    confirmed_ids: [] as string[]
  }
  let checks: unknown = null
  await page.route('**/api/v1/admin/content/proofreading/WORD-SET**', (route) => {
    if (route.request().url().endsWith('/confirm')) {
      checks = route.request().postDataJSON()
      collection.confirmed_ids = ['REV-WORD']
    }
    return route.fulfill({ json: collection })
  })
  await page.route('**/api/v1/admin/content/revisions/REV-WORD', (route) =>
    route.fulfill({
      json: {
        id: 'REV-WORD',
        scene_id: 'SCENE-WORD',
        status: 'DRAFT',
        version: 1,
        content,
        stable_entry_ids: ['WORD-1'],
        stable_sentence_ids: []
      }
    })
  )
  await page.route(
    '**/api/v1/admin/content/revisions/REV-WORD/resources/WORD-AUDIO/signed-url',
    (route) => route.fulfill({ json: { url: '/__word-card.wav' } })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/proofreading')
  await page.locator('.candidate .el-checkbox').first().click()
  const panel = page.locator('.proofreading-set-panel')
  await panel.getByLabel('校对集合编号').fill('WORD-SET')
  await panel.getByRole('button', { name: '恢复集合', exact: true }).click()
  await expect(panel.getByRole('button', { name: '播放 hello 发音', exact: true })).toBeEnabled()
  const listening = panel.locator('.el-checkbox').filter({ hasText: '已实际试听固定音频与切片' })
  await expect(listening.locator('input')).not.toBeChecked()
  await panel.locator('.el-checkbox').filter({ hasText: '已核对中英文' }).click()
  const confirm = panel.getByRole('button', { name: '确认这一篇', exact: true })
  await expect(confirm).toBeDisabled()
  expect(checks).toBeNull()
  await listening.click()
  await confirm.click()
  await expect
    .poll(() => checks)
    .toEqual({
      candidate_hash: hash,
      text_checked: true,
      images_checked: false,
      audio_listened: true
    })
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('V1.5 发布缺项展示中文修正指引并保持发布禁用', async ({ adminApi, page }) => {
  await page.route('**/api/v1/admin/content/revisions/REV-1/publish-checks', (route) =>
    route.fulfill({
      json: {
        revision_id: 'REV-1',
        version: 3,
        ready: false,
        error_codes: [
          'PROOFREADING_CONFIRMATION_REQUIRED',
          'SENTENCE_SLICE_INVALID',
          'CHUNK_IMAGE_INVALID'
        ],
        warning_codes: []
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes/REV-1/publish')
  await page.getByRole('button', { name: '运行发布检查' }).click()
  await expect(
    page.getByText('请进入正常内容抽样，核对样本并完成候选集合确认后重新检查')
  ).toBeVisible()
  await expect(page.getByText(/请进入音频对齐与切片，刷新逐句状态/)).toBeVisible()
  await expect(page.getByText(/请进入结构化编辑，检查语块图片/)).toBeVisible()
  await expect(page.getByRole('button', { name: '确认发布这一候选', exact: true })).toBeDisabled()
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('已发布和下线内容的新草稿均可选入正常抽样', async ({ adminApi, page }) => {
  let statusFilter: string | null = 'not-loaded'
  await page.route('**/api/v1/admin/content/scenes?**', (route) => {
    statusFilter = new URL(route.request().url()).searchParams.get('status')
    return route.fulfill({
      json: {
        items: ['PUBLISHED', 'OFFLINE', 'ALREADY'].map((status) => ({
          id: `SCENE-${status}`,
          status: status === 'ALREADY' ? 'PUBLISHED' : status,
          draft_revision_id: `REV-${status}`,
          published_revision_id: 'LIVE-1',
          title: status,
          series_id: 'SERIES-1',
          series_title: '日常英语',
          cover_object_key: null,
          summary: null,
          updated_at: null,
          template_type: 'dialogue'
        })),
        total: 3,
        page: 1,
        page_size: 20
      }
    })
  })
  await page.route('**/api/v1/admin/content/revisions/REV-PUBLISHED', (route) =>
    route.fulfill({
      json: {
        id: 'REV-PUBLISHED',
        scene_id: 'SCENE-PUBLISHED',
        content: { title_zh: '已发布内容的新候选' },
        stable_entry_ids: [],
        stable_sentence_ids: [],
        status: 'DRAFT',
        version: 2
      }
    })
  )
  await page.route('**/api/v1/admin/content/revisions/REV-OFFLINE', (route) =>
    route.fulfill({
      json: {
        id: 'REV-OFFLINE',
        scene_id: 'SCENE-OFFLINE',
        content: { title_zh: '下线内容的新候选' },
        stable_entry_ids: [],
        stable_sentence_ids: [],
        status: 'DRAFT',
        version: 3
      }
    })
  )
  await page.route('**/api/v1/admin/content/revisions/REV-ALREADY', (route) =>
    route.fulfill({
      json: {
        id: 'REV-ALREADY',
        scene_id: 'SCENE-ALREADY',
        content: { title_zh: '已发布且没有新候选' },
        stable_entry_ids: [],
        stable_sentence_ids: [],
        status: 'PUBLISHED',
        version: 3
      }
    })
  )
  await page.route('**/api/v1/admin/content/short-readings?**', (route) =>
    route.fulfill({ json: { items: [] } })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/proofreading')
  await expect(page.locator('.candidate')).toHaveCount(2)
  await expect(page.getByText('已发布且没有新候选')).toHaveCount(0)
  await page.locator('.candidate .el-checkbox').filter({ hasText: '已发布内容的新候选' }).click()
  await page.locator('.candidate-selection summary').click()
  await page.locator('.candidate .el-checkbox').filter({ hasText: '下线内容的新候选' }).click()
  await expect(page.getByText('当前明确选中 2 篇。', { exact: false })).toBeVisible()
  expect(statusFilter).toBeNull()
  expect(adminApi.unexpectedRequests).toEqual([])
})
