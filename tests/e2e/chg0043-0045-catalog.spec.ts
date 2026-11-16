import { expect, test } from '@playwright/test'

import type { Page } from '@playwright/test'

import { emptyPayload } from '../../src/features/listening/listening-model'

/** 提供两模块的同快照列表、分类统计及历史建议，写入仅记录隔离Mock
 * @param page 当前浏览器测试页面
 * @param options 控制只在指定筛选时失败的独立回归场景
 * @param options.failFilter 是否让非空搜索的组合快照返回503
 * @returns 本轮只读及写入Mock请求记录
 */
const mockCatalog = async (page: Page, options: { failFilter?: boolean } = {}) => {
  let fail = true
  const requests: string[] = [],
    writes: string[] = []
  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname
    if (request.method() !== 'GET') writes.push(path)
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { id: 'catalog-admin', username: '隔离验收', csrf_token: 'synthetic' }
      })
    if (path.endsWith('/content-types/history'))
      return route.fulfill({
        json: {
          items: [
            {
              card_id: 'old',
              name: '历史待归类',
              current_version_id: 'v1',
              study_note_version_id: null,
              draft_revision: 1,
              draft_content_type: null,
              published_content_type: null,
              suggestion: 'illustrated',
              warnings: [],
              snapshot: 'history-v1'
            }
          ],
          page: 1,
          limit: 10,
          total: 1,
          total_pages: 1,
          content_types_ready: false
        }
      })
    if (path.endsWith('/cards') || path.endsWith('/articles')) {
      requests.push(request.url())
      if (options.failFilter && (url.searchParams.get('search') || url.searchParams.get('q')))
        return route.fulfill({
          status: 503,
          json: { error: { code: 'temporarily_unavailable', message: '筛选组合快照失败' } }
        })
      const current = Number(url.searchParams.get('page') || 1),
        isScene = path.endsWith('/cards'),
        empty = url.searchParams.get('search') === 'empty' || url.searchParams.get('q') === 'empty'
      if (current === 3 && fail) {
        fail = false
        return route.fulfill({
          status: 503,
          json: { error: { code: 'temporarily_unavailable', message: '组合快照读取失败' } }
        })
      }
      const items = empty
        ? []
        : Array.from({ length: 10 }, (_, i) => {
            const id = `${current}-${i}`,
              name = `验收内容${id}`
            return isScene
              ? {
                  id,
                  display_name: name,
                  display_title_en: 'Published title',
                  status: 'published',
                  current_version_id: 'v1',
                  draft_revision: 1,
                  content_type: 'illustrated',
                  published_content_type: 'illustrated',
                  draft_content_type: 'intensive',
                  content: { name, dialogue: [], vocabulary: [], chunks: [] },
                  issues: [],
                  is_free: false,
                  free_revision: 1,
                  updated_at: ''
                }
              : {
                  id,
                  category_id: 'life',
                  published_category_id: 'life',
                  draft_category_id: 'news',
                  status: 'published',
                  revision: 1,
                  payload: {
                    ...emptyPayload(),
                    title_zh: name,
                    title_en: 'Published title',
                    audio_id: 'audio'
                  },
                  is_free: false,
                  free_revision: 1,
                  has_unpublished_changes: true,
                  word_count: 111,
                  created_at: ''
                }
          })
      return route.fulfill({
        json: {
          items,
          total: empty ? 0 : 30,
          page: empty ? 1 : current,
          limit: 10,
          total_pages: empty ? 0 : 3,
          statistics: { total: 100, published: 80, free: 30, remaining: 50 },
          all_statistics: { total: 120, published: 90, free: 35, remaining: 55 },
          snapshot_at: '2026-11-16T00:00:00Z'
        }
      })
    }
    if (path.endsWith('/categories'))
      return route.fulfill({
        json: {
          items: [
            { id: 'life', name: '生活听读', sort_order: 1, revision: 1 },
            { id: 'news', name: '新闻听读', sort_order: 2, revision: 1 }
          ]
        }
      })
    return route.fulfill({
      json: path.endsWith('/free-policy') ? { article_ids: [], revision: 1 } : []
    })
  })
  return { requests, writes }
}
for (const path of ['/cards', '/listening']) {
  test(`${path} strict manual jumping retains failed snapshot and selection, preserves free selection across pages and cancels filters`, async ({
    page
  }) => {
    const { requests } = await mockCatalog(page)
    await page.goto(path)
    await expect(page.locator('tbody tr')).toHaveCount(10)
    await expect(page.getByLabel('分类统计')).toContainText('内容总数100')
    await expect(page.getByLabel('分类统计')).toContainText('剩余可开启免费50')
    await expect(page.locator('tbody tr').first()).toContainText(
      path === '/cards' ? '草稿拟改为精读词汇' : '草稿拟改为新闻听读'
    )
    await page.locator('tbody tr').first().locator('.el-checkbox').click()
    const input = page.getByLabel('前往页码'),
      jump = page.getByRole('button', { name: '跳转', exact: true })
    const before = requests.length
    for (const invalid of ['', '0', '-1', '1.5', '2e0', 'abc', '9007199254740992', '4']) {
      await input.fill(invalid)
      await jump.click()
      await expect(page.locator('.page-jump [role=alert]')).toBeVisible()
    }
    expect(requests.length).toBe(before)
    await input.fill('003')
    await input.press('Enter')
    await expect(page.getByLabel('分类统计')).toContainText('保留旧快照，未刷新')
    await expect(page.locator('tbody tr').first().locator('input[type=checkbox]')).toBeChecked()
    expect(new URL(page.url()).searchParams.get('page')).toBeNull()
    await jump.click()
    await expect(page.locator('.pagination')).toContainText('第 3 / 3 页')
    await expect(page.locator('tbody tr').first().locator('input[type=checkbox]')).not.toBeChecked()
    await page.getByRole('button', { name: '批量设置免费', exact: true }).click()
    await page.locator('tbody tr').first().locator('.el-checkbox').click()
    await input.fill('1')
    await jump.click()
    await expect(page.locator('.pagination')).toContainText('第 1 / 3 页')
    await page.locator('tbody tr').first().locator('.el-checkbox').click()
    await expect(page.locator('.free-selection-bar')).toContainText('跨2页')
    const search = page.getByRole('searchbox')
    if (await search.count()) await search.fill('cancelled')
    else await page.getByPlaceholder('搜索中英文标题').fill('cancelled')
    await page.locator('.filters button[type=submit]').click()
    await page.getByRole('button', { name: '保留选择', exact: true }).click()
    await expect(page.locator('.free-selection-bar')).toContainText('跨2页')
    expect(new URL(page.url()).searchParams.get(path === '/cards' ? 'search' : 'q')).toBeNull()
    await page.screenshot({
      path: `/tmp/chg0043-0045-${path === '/cards' ? 'scene' : 'listening'}-1440.png`,
      fullPage: true
    })
  })
}
test('history remains a suggestion until administrator confirms and enable remains independent', async ({
  page
}) => {
  const { writes } = await mockCatalog(page)
  await page.goto('/cards')
  await page.getByRole('button', { name: '旧卡类型核对' }).click()
  await expect(page.getByRole('dialog', { name: '旧卡内容类型核对' })).toContainText('历史待归类')
  expect(writes).toEqual([])
  await page.getByLabel('归类 历史待归类').check()
  await page.getByRole('button', { name: '确认应用选中归类（1）' }).click()
  await expect(page.getByRole('dialog', { name: '确认明确归类' })).toBeVisible()
  expect(writes).toEqual([])
  const confirmation = page.getByRole('dialog', { name: '确认明确归类' })
  const selection = page.getByLabel('归类 历史待归类')
  await page.keyboard.press('Escape')
  await expect(confirmation).not.toBeVisible()
  await selection.uncheck()
  await selection.check({ timeout: 2000 })
  await page.getByRole('button', { name: '确认应用选中归类（1）' }).click()
  await confirmation.locator('.el-dialog__headerbtn').click()
  await selection.uncheck()
  await selection.check({ timeout: 2000 })
  await page.getByRole('button', { name: '确认应用选中归类（1）' }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '确认明确归类' })).not.toBeVisible()
  await page.screenshot({ path: '/tmp/chg0043-history-1440.png', animations: 'disabled' })
})

test('an unknown history write retries the frozen selection only after explicit confirmation', async ({
  page
}) => {
  await mockCatalog(page)
  const attempts: { key: string | undefined; body: string | null }[] = []
  await page.route('**/content-types/confirm', async (route) => {
    const req = route.request()
    attempts.push({ key: req.headers()['idempotency-key'], body: req.postData() })
    if (attempts.length === 1) return route.abort()
    return route.fulfill({ json: { items: [{ card_id: 'old', status: 'confirmed' }] } })
  })
  await page.goto('/cards')
  await page.getByRole('button', { name: '旧卡类型核对' }).click()
  await page.getByLabel('归类 历史待归类').check()
  await page.getByRole('button', { name: '确认应用选中归类（1）' }).click()
  const confirmation = page.getByRole('dialog', { name: '确认明确归类' })
  await confirmation.getByRole('button', { name: '确认归类' }).click()
  await expect(confirmation.getByRole('alert')).toContainText('网络')
  await page.keyboard.press('Escape')
  await expect(confirmation).toBeVisible()
  expect(attempts).toHaveLength(1)
  await confirmation.getByRole('button', { name: '确认归类' }).click()
  await expect(confirmation).not.toBeVisible()
  expect(attempts[0]?.key).toBeTruthy()
  expect(attempts).toEqual([attempts[0], attempts[0]])
})
test('single scene keeps explicit type and PDF conflict, automatically verifies real word forms and shows only exceptions', async ({
  page
}) => {
  const writes: { path: string; body: Record<string, unknown> }[] = []
  const vocabulary = [
    {
      id: 'buy',
      english: 'buy',
      meaning: '买',
      phonetic: '',
      source_hint: '',
      pronunciation_text: 'buy',
      pronunciation_issue: false,
      source: { line_id: 'line', start: 5, end: 11, quote: 'bought' }
    },
    {
      id: 'missing',
      english: 'departure',
      meaning: '离开',
      phonetic: '',
      source_hint: '',
      pronunciation_text: 'departure',
      pronunciation_issue: false,
      source: null,
      source_reason: 'source_unmatched'
    }
  ]
  const content = {
    name: '来源与类型验收',
    title_en: 'Type and Sources',
    dialogue: [{ id: 'line', speaker: 'A', english: '😀 I bought coffee.', chinese: '我买了咖啡' }],
    vocabulary,
    chunks: [],
    image_id: null,
    audio_id: null
  }
  let card = {
    id: 'typed',
    draft_revision: 1,
    status: 'published',
    content,
    content_type: 'illustrated',
    published_content_type: 'illustrated',
    draft_content_type: 'illustrated',
    study_note: { action: 'keep', attachment: null, can_publish: true },
    issues: []
  }
  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { id: 'catalog-admin', username: '隔离验收', csrf_token: 'synthetic' }
      })
    if (path.endsWith('/configuration'))
      return route.fulfill({
        json: {
          image_limit_bytes: 1000000,
          audio_limit_bytes: 1000000,
          study_note_limit_bytes: 1000000
        }
      })
    if (path.endsWith('/vocabulary/sources/preview'))
      return route.fulfill({ json: { module: 'scene', vocabulary } })
    if (path.endsWith('/preview'))
      return route.fulfill({
        status: 409,
        json: { error: { code: 'content_type_pdf_required', message: '精读词汇需要有效PDF' } }
      })
    if (request.method() === 'PUT') {
      const body = request.postDataJSON()
      writes.push({ path, body })
      card = {
        ...card,
        content: body.content,
        draft_revision: 2,
        draft_content_type: body.content_type
      }
      return route.fulfill({ json: card })
    }
    if (path.endsWith('/cards/typed')) return route.fulfill({ json: card })
    return route.fulfill({ json: [] })
  })
  await page.goto('/cards/typed')
  await expect(page.locator('.source-review')).toContainText('自动通过 1 · 人工已确认 0 · 待核对 1')
  await expect(page.locator('.source-review')).toContainText('bought')
  await expect(page.locator('.source-review')).toContainText('无需手动确认')
  await page.locator('.source-review .el-checkbox').click()
  await expect(page.locator('.source-review tbody tr')).toHaveCount(1)
  await expect(page.locator('.source-review tbody')).toContainText('departure')
  await page.locator('.content-type .el-radio').filter({ hasText: '精读词汇' }).click()
  await expect(page.locator('.content-type')).toContainText('发布前须上传并校验有效PDF')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]?.body.content_type).toBe('intensive')
  expect(card.published_content_type).toBe('illustrated')
  await page.getByRole('button', { name: '预览并发布', exact: true }).click()
  await expect(
    page.locator('.editor-page [role=alert]').filter({ hasText: '精读词汇需要有效PDF' })
  ).toBeVisible()
  await page.screenshot({ path: '/tmp/chg0043-0044-scene-type-source-1440.png', fullPage: true })
})

test('scene ZIP classification preserves file values, excludes duplicates, confirms overwrite impact and reloads whole-batch duplicate pages', async ({
  page
}) => {
  const makeItem = (id: string, contentType: string | null, state = 'incomplete') => ({
    id,
    revision: 1,
    selected: state !== 'duplicate',
    readable: true,
    state,
    content_type: contentType,
    type_origin: contentType ? 'file' : null,
    type_raw: contentType ? ['图解词汇'] : [],
    study_note: { action: 'keep', attachment: null, can_publish: true },
    content: {
      name: id,
      title_en: 'Import Review',
      image_id: null,
      audio_id: null,
      dialogue: [],
      vocabulary: [],
      chunks: []
    },
    thumbnail_id: null,
    issues: [],
    source_file_id: 'doc',
    source_zip_id: 'source',
    source_zip_name: 'archive.zip',
    source_folder: id,
    target_card_id: null,
    target_revision: null,
    saved_card_id: null,
    saved_draft_revision: null,
    suggested_target_id: null,
    job_id: null,
    error_code: null
  })
  let batch = {
    id: 'classification',
    removed_count: 0,
    mode: 'zip',
    created_at: '2026-11-16T00:00:00Z',
    updated_at: '2026-11-16T00:00:00Z',
    resumable: true,
    stage: 'review',
    source_names: ['archive.zip'],
    files: [
      {
        id: 'source',
        name: 'archive.zip',
        kind: 'zip',
        state: 'ready',
        size: 100,
        media_id: null,
        job_id: null,
        error_code: null,
        parent_id: ''
      }
    ],
    items: [
      makeItem('file-type', 'illustrated'),
      makeItem('missing-type', null),
      {
        ...makeItem('invalid-type', null),
        type_raw: ['未知类型', '精读词汇'],
        issues: [
          {
            field: 'content_type',
            code: 'invalid',
            message: '文件类型存在未知或多个值，请逐项核对'
          }
        ]
      },
      ...Array.from({ length: 21 }, (_, i) => makeItem(`duplicate-${i + 1}`, null, 'duplicate'))
    ],
    unused_file_ids: []
  }
  const previews: Record<string, unknown>[] = [],
    applies: Record<string, unknown>[] = []
  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { id: 'catalog-admin', username: '隔离验收', csrf_token: 'synthetic' }
      })
    if (path.endsWith('/configuration'))
      return route.fulfill({
        json: {
          archive_limit_bytes: 10000000,
          image_limit_bytes: 1000000,
          audio_limit_bytes: 1000000,
          study_note_limit_bytes: 1000000,
          import_card_limit: 100
        }
      })
    if (path.endsWith('/content-types/preview')) {
      const body = request.postDataJSON()
      previews.push(body)
      const items = batch.items
        .filter(
          (item) =>
            item.state !== 'duplicate' &&
            (item.content_type || !item.type_raw.length) &&
            (body.overwrite || !item.content_type)
        )
        .map((item) => ({
          id: item.id,
          revision: item.revision,
          old_type: item.content_type,
          new_type: body.content_type,
          pdf_conflict: body.content_type === 'intensive'
        }))
      return route.fulfill({ json: { count: items.length, version: 'frozen-types', items } })
    }
    if (path.endsWith('/content-types/apply')) {
      const body = request.postDataJSON()
      applies.push(body)
      batch = {
        ...batch,
        items: batch.items.map((item) =>
          item.state !== 'duplicate' &&
          (item.content_type || !item.type_raw.length) &&
          (body.overwrite || !item.content_type)
            ? {
                ...item,
                revision: item.revision + 1,
                content_type: body.content_type,
                type_origin: body.overwrite ? 'override' : 'manual'
              }
            : item
        )
      }
      return route.fulfill({ json: batch })
    }
    if (path.endsWith('/duplicates')) {
      const current = Number(url.searchParams.get('page') || 1)
      return route.fulfill({
        json: {
          items: Array.from({ length: current === 1 ? 20 : 1 }, (_, i) => ({
            candidate_id: `duplicate-${(current - 1) * 20 + i + 1}`,
            source_name: 'archive.zip',
            source_path: 'folder/doc.docx',
            title_zh: `重复${(current - 1) * 20 + i + 1}`,
            title_en: 'Duplicate',
            reason: 'cross_package',
            target_kind: 'scene_card',
            target_id: 'unavailable-target',
            target_available: false
          })),
          total: 21,
          page: current,
          limit: 20,
          total_pages: 2
        }
      })
    }
    if (path === '/api/admin/v1/imports/classification') return route.fulfill({ json: batch })
    if (path === '/api/admin/v1/imports') return route.fulfill({ json: [batch] })
    return route.fulfill({ json: [] })
  })
  await page.goto('/imports?batch=classification')
  await expect(page.locator('.review-list [data-item-id]')).toHaveCount(24)
  expect(
    await page
      .locator('.review-list thead th')
      .nth(3)
      .evaluate((cell) => cell.getBoundingClientRect().width)
  ).toBeGreaterThan(150)
  await expect(page.locator('[data-item-id="duplicate-1"] input[type=checkbox]')).toBeDisabled()
  await page.getByRole('button', { name: '批量指定类型', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '核对批量类型变更' })).toContainText('missing-type')
  expect(previews[0]?.overwrite).toBe(false)
  expect(previews[0]?.items).toEqual([
    { id: 'file-type', revision: 1 },
    { id: 'missing-type', revision: 1 },
    { id: 'invalid-type', revision: 1 }
  ])
  expect(applies).toEqual([])
  await page.getByRole('button', { name: '确认应用类型', exact: true }).click()
  await expect.poll(() => applies.length).toBe(1)
  expect(batch.items.find((item) => item.id === 'file-type')?.type_origin).toBe('file')
  expect(batch.items.find((item) => item.id === 'missing-type')?.content_type).toBe('illustrated')
  expect(batch.items.find((item) => item.id === 'invalid-type')?.content_type).toBeNull()
  await expect(page.locator('[data-item-id=invalid-type]')).toContainText('未知类型、精读词汇')
  await expect(page.locator('[data-item-id=invalid-type]')).toContainText('请逐项核对')
  await page.locator('.type-batch .el-checkbox').click()
  await page.locator('.type-batch .el-select__wrapper').click()
  await page.getByRole('option', { name: '精读词汇', exact: true }).click()
  await page.getByRole('button', { name: '批量指定类型', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '核对批量类型变更' })).toContainText(
    '冲突，须修正后发布'
  )
  expect(previews.at(-1)?.overwrite).toBe(true)
  await page
    .getByRole('dialog', { name: '核对批量类型变更' })
    .getByRole('button', { name: '取消', exact: true })
    .click()
  await page.locator('.import-summary').getByRole('button', { name: '查看明细' }).click()
  const dialog = page.getByRole('dialog', { name: '重复文件明细' })
  await expect(dialog.locator('tbody tr')).toHaveCount(20)
  await dialog.getByRole('button', { name: '下一页' }).click()
  await expect(dialog).toContainText('重复21')
  await expect(dialog.getByRole('button', { name: '目标已移除或不可访问' })).toBeDisabled()
  await page.screenshot({ path: '/tmp/chg0043-0044-import-details-1440.png', fullPage: true })
  await dialog.getByRole('button', { name: '返回核对并保留位置' }).click()
  await page.reload()
  await expect(page.locator('[data-item-id="missing-type"]')).toContainText('图解词汇')
})

test('listening restored duplicates remain excluded and open retained candidates by kind within the same batch', async ({
  page
}) => {
  const payload = { ...emptyPayload(), title_zh: '保留文章', title_en: 'Retained Article' }
  const candidate = {
    id: 'keep',
    package_id: 'package',
    path: '1/content.docx',
    state: 'incomplete',
    payload,
    category_id: 'life',
    resources: { audio: [], image: [] },
    errors: [],
    removed: false,
    article_id: null,
    duplicate_of: null,
    timeline: { state: 'missing' }
  }
  const batch = {
    id: 'listening-batch',
    mode: 'zip',
    revision: 1,
    status: 'review',
    packages: [],
    counts: { total: 2, incomplete: 1, duplicate: 1 },
    candidates: [
      candidate,
      {
        ...candidate,
        id: 'duplicate',
        state: 'duplicate',
        payload: { ...payload, title_zh: '重复文章' },
        duplicate_of: 'keep'
      }
    ]
  }
  await page.route('**/api/admin/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { id: 'catalog-admin', username: '隔离验收', csrf_token: 'synthetic' }
      })
    if (path.endsWith('/categories'))
      return route.fulfill({
        json: { items: [{ id: 'life', name: '生活听读', sort_order: 1, revision: 1 }] }
      })
    if (path.endsWith('/imports/listening-batch/duplicates'))
      return route.fulfill({
        json: {
          items: [
            {
              candidate_id: 'duplicate',
              source_name: 'audio.zip',
              source_path: '2/content.docx',
              title_zh: '重复文章',
              title_en: 'Repeated Article',
              reason: 'same_package',
              target_kind: 'listening_candidate',
              target_id: 'keep',
              target_available: true
            }
          ],
          total: 1,
          page: 1,
          limit: 20,
          total_pages: 1
        }
      })
    if (path.endsWith('/imports/listening-batch')) return route.fulfill({ json: batch })
    if (path.endsWith('/listening/imports'))
      return route.fulfill({ json: { items: [batch], total: 1, page: 1, limit: 50 } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/listening-imports?batch_id=listening-batch')
  await expect(page.getByRole('heading', { name: '核对本批文章' })).toBeVisible()
  await expect(page.locator('input[aria-label="选择重复文章"]')).toBeDisabled()
  await page.getByRole('button', { name: '查看明细', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '重复文件明细' })
  await expect(dialog).toContainText('audio.zip')
  await expect(dialog).toContainText('与本包已保留对象相同')
  await dialog.getByRole('button', { name: '定位保留候选' }).click()
  await expect(page.locator('.candidate.expanded')).toContainText('保留文章')
  await expect(page).toHaveURL(/listening-imports\?batch_id=listening-batch/)
  await expect(page.getByText('图解词汇', { exact: true })).toHaveCount(0)
  await page.screenshot({
    path: '/tmp/chg0044-listening-candidate-1440.png',
    animations: 'disabled'
  })
})

for (const path of ['/cards', '/listening']) {
  test(`${path} retains confirmed cross-page free selection after a filter 503`, async ({
    page
  }) => {
    await mockCatalog(page, { failFilter: true })
    await page.goto(path)
    await page.getByRole('button', { name: '批量设置免费', exact: true }).click()
    await page.locator('tbody tr').first().locator('.el-checkbox').click()
    await page.getByLabel('前往页码').fill('2')
    await page.getByRole('button', { name: '跳转', exact: true }).click()
    await expect(page.locator('.pagination')).toContainText('第 2 / 3 页')
    await page.locator('tbody tr').first().locator('.el-checkbox').click()
    await expect(page.locator('.free-selection-bar')).toContainText('跨2页')
    await page.locator('.filters input').first().fill('failed-filter')
    await page.locator('.filters button[type=submit]').click()
    await page.getByRole('button', { name: '清空并继续', exact: true }).click()
    await expect(page.getByLabel('分类统计')).toContainText('保留旧快照，未刷新')
    expect(new URL(page.url()).searchParams.get('page')).toBe('2')
    expect(new URL(page.url()).searchParams.get(path === '/cards' ? 'search' : 'q')).toBeNull()
    await expect(page.locator('.free-selection-bar')).toContainText('跨2页')
    await expect(page.locator('tbody tr').first().locator('input[type=checkbox]')).toBeChecked()
    await page.getByLabel('前往页码').fill('1')
    await page.getByRole('button', { name: '跳转', exact: true }).click()
    await expect(page.locator('.pagination')).toContainText('第 1 / 3 页')
    await expect(page.locator('tbody tr').first().locator('input[type=checkbox]')).toBeChecked()
    await expect(page.locator('.free-selection-bar')).toContainText('跨2页')
  })
}

test('listening publishes a server source with emoji, repeated punctuation and the original closing quote', async ({
  page
}) => {
  const body = '😀 She bought tea?!"'
  const vocabulary = [
    {
      id: 'word',
      english: 'buy',
      meaning: '买',
      phonetic: '',
      source_hint: '',
      source: {
        start: 0,
        end: [...body].length,
        quote: body,
        word_start: 6,
        word_end: 12,
        word: 'bought',
        confirmed: false
      }
    }
  ]
  const payload = {
    ...emptyPayload(),
    title_zh: '服务端原句',
    title_en: 'Original Server Quote',
    body_en: body,
    translation_zh: '她买了茶',
    audio_id: 'audio',
    expressions: Array.from({ length: 5 }, () => ({
      english: 'expression',
      chinese: '表达',
      example: 'Example.'
    })),
    vocabulary
  }
  const article = {
    id: 'quoted',
    category_id: 'c',
    status: 'draft',
    revision: 1,
    payload,
    word_count: 4,
    timeline: { state: 'missing' },
    is_free: false,
    free_revision: 1
  }
  let published = 0
  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (path.endsWith('/auth/session'))
      return route.fulfill({
        json: { id: 'quoted-admin', username: '隔离验收', csrf_token: 'synthetic' }
      })
    if (path.endsWith('/categories'))
      return route.fulfill({
        json: { items: [{ id: 'c', name: '生活听读', revision: 1, sort_order: 1 }] }
      })
    if (path.endsWith('/vocabulary/sources/preview'))
      return route.fulfill({ json: { module: 'listening', vocabulary } })
    if (path.endsWith('/articles/quoted/publish')) {
      published++
      expect(request.postDataJSON()).toEqual({ revision: 1 })
      return route.fulfill({ json: { ...article, status: 'published', revision: 2 } })
    }
    if (path.endsWith('/articles/quoted')) return route.fulfill({ json: article })
    if (path.endsWith('/articles'))
      return route.fulfill({
        json: {
          items: [],
          total: 0,
          page: 1,
          limit: 10,
          total_pages: 0,
          statistics: { total: 0, published: 0, free: 0, remaining: 0 },
          all_statistics: { total: 0, published: 0, free: 0, remaining: 0 }
        }
      })
    return route.fulfill({
      json: path.endsWith('/free-policy') ? { article_ids: [], revision: 1 } : []
    })
  })
  await page.goto('/listening/quoted')
  const publish = page.locator('.save-panel').getByRole('button', { name: '发布', exact: true })
  await expect(publish).toBeEnabled()
  await publish.click()
  await expect(page).toHaveURL(/\/listening$/)
  expect(published).toBe(1)
})
