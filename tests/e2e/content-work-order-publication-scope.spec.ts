import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { item, mockWorkOrder, order } from './fixtures/content-work-orders'

test('发布前、空排队、部分结果与原回执刷新保持不同统计及冻结失败子集', async ({
  adminApi,
  page
}, testInfo) => {
  expect(adminApi).toBeDefined()
  await mockWorkOrder(page)
  let phase: 'PREVIEW' | 'QUEUED' | 'PARTIAL' = 'PREVIEW'
  let retrying = false
  const rows = [
    'Weekend Plans',
    'A Quick Lunch',
    'A Rainy Day',
    'Retained new draft',
    'Organize failure',
    'Unselected qualified',
    'Old published'
  ].map((title, index) => ({
    ...item,
    item_id: `item-${index}`,
    content_id: `content-${index}`,
    revision_id: `revision-${index}`,
    title_en: title,
    current_draft: index !== 6,
    publishable: index < 3 || index === 5,
    published: index === 3 || index === 6,
    production_status:
      index === 4
        ? 'failed'
        : index === 3
          ? 'review_required'
          : index === 6
            ? 'published'
            : 'normal',
    issues: []
  }))
  const writes: { path: string; body: Record<string, unknown> }[] = []
  const frozen = rows.slice(0, 3).map((row) => ({
    content_type: 'short_reading',
    content_id: row.content_id,
    revision_id: row.revision_id,
    candidate_hash: row.candidate_hash,
    expected_version: 1,
    expected_edit_version: 1,
    warning_codes: []
  }))
  await page.route('**/api/v1/admin/content-production/work-orders/order**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (request.method() === 'POST') {
      writes.push({ path, body: request.postDataJSON() as Record<string, unknown> })
      phase = 'QUEUED'
      retrying = path.endsWith('/publication-retry')
      return route.fulfill({
        json: {
          command_id: 'original-command',
          work_order_id: 'order',
          status: 'QUEUED',
          action: retrying ? 'publication-retry' : 'publication-confirm',
          version: 2,
          stage_id: 'original-stage'
        }
      })
    }
    if (path.endsWith('/publication'))
      return route.fulfill({
        json: {
          work_order_id: 'order',
          token: 'frozen-original',
          version: phase === 'PREVIEW' ? 1 : 2,
          collection_hash: 'd'.repeat(64),
          status: phase,
          expires_at: '2030-01-01T00:00:00Z',
          stage_id: phase === 'PREVIEW' ? null : 'original-stage',
          candidates: frozen,
          results:
            phase === 'PARTIAL' || retrying
              ? [
                  { revision_id: 'revision-0', status: 'SUCCEEDED' },
                  {
                    revision_id: 'revision-1',
                    status: 'FAILED',
                    error_code: 'PUBLICATION_PREVIEW_STALE'
                  },
                  {
                    revision_id: 'revision-2',
                    status: 'UNKNOWN',
                    error_code: 'PUBLICATION_ITEM_RESULT_UNKNOWN'
                  }
                ]
              : []
        }
      })
    if (path.endsWith('/items'))
      return route.fulfill({
        json: {
          items: rows,
          total: rows.length,
          page: 1,
          page_size: 100,
          version: 1,
          collection_hash: 'members',
          counts: { ...order.counts, total: rows.length, publishable: 4 }
        }
      })
    return route.fulfill({
      json: {
        ...order,
        publication_token: 'frozen-original',
        counts: { ...order.counts, total: rows.length, publishable: 4 }
      }
    })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order?view=publication')
  await expect(page.locator('.header h1')).toHaveText('确认发布范围')
  await expect(page.locator('.context h2')).toHaveCount(0)
  await expect(page.locator('.metrics article')).toHaveText([
    '3本次可发布',
    '1仍需校对',
    '1处理失败',
    '3本次保留草稿'
  ])
  await page.screenshot({ path: testInfo.outputPath('pre-1440.png'), animations: 'disabled' })
  await page.getByText('已核对本次发布范围与来源 / 版权备注', { exact: true }).click()
  await page.getByRole('button', { name: '确认发布 3 篇', exact: true }).click()
  await expect(page.getByText('本次发布已提交，等待逐篇结果', { exact: true })).toBeVisible()
  await expect(page.locator('.header h1')).toHaveText('发布结果')
  await expect(page.locator('.header .subtitle')).not.toContainText('成功项已发布')
  expect(writes[0]!.body).toMatchObject({
    scope: 'selected',
    selected_item_ids: ['item-0', 'item-1', 'item-2'],
    publication_token: 'frozen-original',
    range_version: 1,
    collection_hash: 'd'.repeat(64),
    manual_confirmed: true
  })
  await expect(page.locator('.metrics article')).toHaveText([
    '0已发布',
    '0发布失败',
    '1仍需校对',
    '1处理失败'
  ])
  await page.screenshot({
    path: testInfo.outputPath('queued-empty-1440.png'),
    animations: 'disabled'
  })
  phase = 'PARTIAL'
  await page.getByRole('button', { name: '刷新发布结果', exact: true }).click()
  await expect(page.getByText('成功已保留', { exact: true })).toBeVisible()
  await expect(page.locator('.publication-failed-table .el-table__body tbody tr')).toHaveCount(1)
  await expect(page.locator('.publication-failed-table')).toContainText('A Quick Lunch')
  await expect(page.locator('.publication-failed-table')).not.toContainText('A Rainy Day')
  await expect(page.locator('.publication-unknown')).toContainText('A Rainy Day')
  await expect(page.locator('.metrics article')).toHaveText([
    '1已发布',
    '1发布失败',
    '1仍需校对',
    '1处理失败'
  ])
  await expect(page.getByText('PUBLICATION_PREVIEW_STALE', { exact: false })).toBeVisible()
  await expect(page.getByText('原发布任务：original-stage')).toBeVisible()
  await expect(page.getByRole('heading', { name: '选择当前合格子集', exact: true })).toHaveCount(0)
  await page.locator('.page-scrollbar-wrap').evaluate((element) => element.scrollTo(0, 0))
  await page.screenshot({
    path: testInfo.outputPath('partial-failed-unknown-1440.png'),
    animations: 'disabled'
  })
  for (const [width, height] of [
    [390, 844],
    [768, 1024]
  ]) {
    await page.setViewportSize({ width: width!, height: height! })
    await page.locator('.page-scrollbar-wrap').evaluate((element) => element.scrollTo(0, 0))
    await page.screenshot({
      path: testInfo.outputPath(`result-viewport-${width}.png`),
      animations: 'disabled'
    })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '仅重试 1 篇发布失败', exact: true }).click()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1]!.path).toContain('/publication-retry')
  expect(writes[1]!.body).toMatchObject({
    selected_item_ids: ['item-1'],
    publication_token: 'frozen-original',
    range_version: 2,
    collection_hash: 'd'.repeat(64)
  })
  await expect(
    page.getByRole('button', { name: '仅重试 1 篇发布失败', exact: true })
  ).toBeDisabled()
  await expect(page.getByText('成功已保留', { exact: true })).toBeVisible()
})

test('主顶栏仅采用匹配工作单和回执的实际阶段，读取失败与迟到结果不冒充成功', async ({
  adminApi,
  page
}) => {
  await mockWorkOrder(page)
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = false
  let mode: 'PREVIEW' | 'WRONG_ORDER' | 'WRONG_TOKEN' | 'ERROR' = 'PREVIEW'
  let writes = 0
  await page.route('**/api/v1/admin/content-production/work-orders/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') {
      writes++
      return route.abort()
    }
    const id = path.includes('/late-A') ? 'late-A' : 'current-B'
    if (path.endsWith('/publication')) {
      if (id === 'late-A') {
        started = true
        await gate
      }
      if (mode === 'ERROR') return route.fulfill({ status: 503, json: { message: '读取失败' } })
      return route.fulfill({
        json: {
          work_order_id: mode === 'WRONG_ORDER' ? 'foreign' : id,
          token: mode === 'WRONG_TOKEN' ? 'foreign-token' : `token-${id}`,
          version: 1,
          collection_hash: 'd'.repeat(64),
          status: id === 'late-A' ? 'COMPLETED' : 'PREVIEW',
          candidates: [],
          results: [],
          expires_at: '2030-01-01T00:00:00Z',
          stage_id: null
        }
      })
    }
    if (path.endsWith('/items'))
      return route.fulfill({
        json: {
          items: [],
          total: 0,
          page: 1,
          page_size: 100,
          version: 1,
          collection_hash: 'members',
          counts: { ...order.counts, total: 0 }
        }
      })
    return route.fulfill({
      json: {
        ...order,
        work_order_id: id,
        publication_token: `token-${id}`,
        counts: { ...order.counts, total: 0 }
      }
    })
  })
  await loginAsAdmin(page)
  const lateResponse = page.waitForResponse((response) =>
    response.url().includes('/late-A/publication')
  )
  await navigateInApp(page, '/content/work-orders/late-A?view=publication&phase=result')
  await expect.poll(() => started).toBe(true)
  await expect(page.locator('.header h1')).toHaveText('校对与发布')
  await navigateInApp(page, '/content/work-orders/current-B?view=publication&phase=result')
  try {
    await expect(page.locator('.header h1')).toHaveText('确认发布范围')
  } finally {
    release?.()
  }
  await (await lateResponse).finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(page.locator('.header h1')).toHaveText('确认发布范围')
  for (const next of ['WRONG_ORDER', 'WRONG_TOKEN', 'ERROR'] as const) {
    mode = next
    const refreshed = page.waitForResponse((response) =>
      response.url().includes('/current-B/publication')
    )
    await page.getByRole('button', { name: '刷新进度', exact: true }).click()
    await (await refreshed).finished()
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await expect(page.locator('.header h1')).toHaveText('校对与发布')
    await expect(page.locator('.header .subtitle')).not.toContainText('成功项已发布')
  }
  await navigateInApp(page, '/dashboard')
  await expect(page.locator('.header h1')).toHaveText('工作台')
  mode = 'PREVIEW'
  await navigateInApp(page, '/content/work-orders/current-B?view=publication')
  await expect(page.locator('.header h1')).toHaveText('确认发布范围')
  expect(writes).toBe(0)
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('混合工作单按冻结合格 A 确认发布，异常 B 保留草稿', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  await mockWorkOrder(page)
  const rows = ['A', 'B'].map((name) => ({
    ...item,
    item_id: name,
    content_id: `content-${name}`,
    revision_id: `revision-${name}`,
    title_en: name,
    current_draft: true,
    publishable: name === 'A'
  }))
  let previewed = false
  let published = false
  const submitted: Record<string, unknown>[] = []
  await page.route('**/api/v1/admin/content-production/work-orders/order**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname
    if (path.endsWith('/items'))
      return route.fulfill({
        json: {
          items: rows,
          total: 2,
          page: 1,
          page_size: 100,
          version: 1,
          collection_hash: 'fixed-two',
          counts: { ...order.counts, total: 2, publishable: 1, published: published ? 1 : 0 }
        }
      })
    if (path.endsWith('/publication-preview')) {
      previewed = true
      return route.fulfill({ json: { status: 'SUCCEEDED' } })
    }
    if (path.endsWith('/publication-confirm')) {
      const body = request.postDataJSON() as Record<string, unknown>
      submitted.push(body)
      if (body.scope !== 'selected' || JSON.stringify(body.selected_item_ids) !== '["A"]')
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'WORK_PUBLICATION_SCOPE_INVALID',
              message: '篇目超出冻结发布范围'
            }
          }
        })
      published = true
      return route.fulfill({ json: { status: 'SUCCEEDED' } })
    }
    if (path.endsWith('/publication'))
      return route.fulfill({
        json: {
          work_order_id: 'order',
          token: 'frozen-A',
          version: 3,
          collection_hash: 'd'.repeat(64),
          status: published ? 'COMPLETED' : 'PREVIEW',
          stage_id: null,
          expires_at: '2026-10-15T00:00:00Z',
          candidates: [
            {
              content_type: 'short_reading',
              content_id: 'content-A',
              revision_id: 'revision-A',
              candidate_hash: item.candidate_hash,
              expected_version: 1,
              warning_codes: []
            }
          ],
          results: published ? [{ revision_id: 'revision-A', status: 'SUCCEEDED' }] : []
        }
      })
    return route.fulfill({
      json: {
        ...order,
        publication_token: previewed ? 'frozen-A' : null,
        counts: { ...order.counts, total: 2, publishable: 1, published: published ? 1 : 0 }
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order?view=publication')
  await page.getByRole('button', { name: '预览全部合格篇目', exact: true }).click()
  await page.getByText('已核对本次发布范围与来源 / 版权备注', { exact: true }).click()
  await page.getByRole('button', { name: '确认发布 1 篇', exact: true }).click()
  await expect.poll(() => submitted.length).toBe(1)
  expect(submitted[0]).toMatchObject({
    scope: 'selected',
    selected_item_ids: ['A'],
    publication_token: 'frozen-A',
    range_version: 3,
    collection_hash: 'd'.repeat(64)
  })
  await expect(page.getByText('成功已保留', { exact: true })).toBeVisible()
  await expect(page.getByText(/当前批次未纳入本次范围的草稿：1 篇/)).toBeVisible()
  await expect(page.locator('.metrics article').filter({ hasText: '仍需校对' })).toHaveText(
    '1仍需校对'
  )
})

for (const scenario of ['subset', 'paged', 'retry', 'stale', 'missing', 'incomplete'] as const) {
  test(`冻结发布范围 ${scenario} 不受当前选择或显示页影响`, async ({ adminApi, page }) => {
    expect(adminApi).toBeDefined()
    await mockWorkOrder(page)
    const rows = Array.from(
      { length: scenario === 'paged' || scenario === 'incomplete' ? 101 : 3 },
      (_, index) => ({
        ...item,
        item_id: `item-${index}`,
        content_id: `content-${index}`,
        revision_id: `revision-${index}`,
        title_en: `Eligible ${index}`,
        current_draft: true,
        publishable: true,
        issues: []
      })
    )
    const target = scenario === 'paged' || scenario === 'incomplete' ? rows[100]! : rows[0]!
    const frozen = (scenario === 'retry' ? rows.slice(0, 2) : [target]).map((row) => ({
      content_type: 'short_reading',
      content_id: row.content_id,
      revision_id: row.revision_id,
      candidate_hash: row.candidate_hash,
      expected_version: 1,
      warning_codes: []
    }))
    if (scenario === 'stale') target.candidate_hash = 'changed'
    if (scenario === 'missing') target.revision_id = 'new-revision'
    let previewed = scenario !== 'subset'
    let finished = false
    const submitted: Record<string, unknown>[] = []
    const memberPages: number[] = []
    await page.route('**/api/v1/admin/content-production/work-orders/order**', async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname
      if (path.endsWith('/items')) {
        const pageNo = Number(url.searchParams.get('page') || 1)
        const size = Number(url.searchParams.get('page_size') || 20)
        if (size === 100) memberPages.push(pageNo)
        return route.fulfill({
          json: {
            items:
              scenario === 'incomplete' && pageNo === 2
                ? []
                : rows.slice((pageNo - 1) * size, pageNo * size),
            total: rows.length,
            page: pageNo,
            page_size: size,
            version: 1,
            collection_hash: 'fixed-scope',
            counts: { ...order.counts, total: rows.length, publishable: rows.length }
          }
        })
      }
      if (path.endsWith('/publication-preview')) {
        expect(req.postDataJSON()).toMatchObject({
          scope: 'publishable',
          selected_item_ids: ['item-0']
        })
        previewed = true
        return route.fulfill({ json: { status: 'SUCCEEDED' } })
      }
      if (path.endsWith('/publication-confirm') || path.endsWith('/publication-retry')) {
        const body = req.postDataJSON() as Record<string, unknown>
        submitted.push(body)
        const expected = scenario === 'retry' ? ['item-1'] : [target.item_id]
        if (
          body.scope !== 'selected' ||
          JSON.stringify(body.selected_item_ids) !== JSON.stringify(expected)
        )
          return route.fulfill({
            status: 409,
            json: {
              error: { code: 'WORK_PUBLICATION_SCOPE_INVALID', message: '篇目超出冻结发布范围' }
            }
          })
        finished = true
        return route.fulfill({ json: { status: 'SUCCEEDED' } })
      }
      if (path.endsWith('/publication'))
        return route.fulfill({
          json: {
            work_order_id: 'order',
            token: 'original-token',
            version: 7,
            collection_hash: 'd'.repeat(64),
            status: finished ? 'SUCCEEDED' : scenario === 'retry' ? 'PARTIAL' : 'PREVIEW',
            stage_id: null,
            expires_at: '2026-10-15T00:00:00Z',
            candidates: frozen,
            results: finished
              ? frozen.map((c) => ({ revision_id: c.revision_id, status: 'SUCCEEDED' }))
              : scenario === 'retry'
                ? [
                    { revision_id: 'revision-0', status: 'SUCCEEDED' },
                    { revision_id: 'revision-1', status: 'FAILED' }
                  ]
                : []
          }
        })
      return route.fulfill({
        json: {
          ...order,
          publication_token: previewed ? 'original-token' : null,
          counts: { ...order.counts, total: rows.length, publishable: rows.length }
        }
      })
    })
    await loginAsAdmin(page)
    await navigateInApp(page, '/content/work-orders/order?view=publication')
    if (scenario === 'subset') {
      await page.locator('.el-checkbox').getByText('Eligible 0', { exact: true }).click()
      await page.getByRole('button', { name: '预览选中 1 篇', exact: true }).click()
      await expect(page.getByRole('button', { name: '确认发布 1 篇', exact: true })).toBeVisible()
      await page.locator('.el-checkbox').getByText('Eligible 1', { exact: true }).click()
      await page.locator('.el-checkbox').getByText('Eligible 0', { exact: true }).click()
    }
    if (scenario === 'incomplete') {
      await expect(
        page.getByText('成员范围读取不完整，请刷新权威状态并重新预览', { exact: true })
      ).toBeVisible()
      await expect(page.getByRole('button', { name: '确认发布 1 篇', exact: true })).toBeDisabled()
      expect(submitted).toEqual([])
      return
    }
    if (scenario !== 'retry')
      await page.getByText('已核对本次发布范围与来源 / 版权备注', { exact: true }).click()
    await page
      .getByRole('button', {
        name: scenario === 'retry' ? '仅重试 1 篇发布失败' : '确认发布 1 篇',
        exact: true
      })
      .click()
    if (scenario === 'stale' || scenario === 'missing') {
      await expect(
        page.getByText('发布范围与当前篇目不一致，请刷新权威状态并重新预览', { exact: true })
      ).toBeVisible()
      expect(submitted).toEqual([])
      return
    }
    await expect.poll(() => submitted.length).toBe(1)
    expect(submitted[0]).toMatchObject({
      scope: 'selected',
      selected_item_ids: scenario === 'retry' ? ['item-1'] : [target.item_id],
      publication_token: 'original-token',
      range_version: 7
    })
    await expect(page.getByText('成功已保留', { exact: true })).toHaveCount(
      scenario === 'retry' ? 2 : 1
    )
    if (scenario === 'paged') expect(memberPages).toContain(2)
  })
}

for (const status of ['QUEUED', 'RUNNING', 'PARTIAL'] as const) {
  test(`已提交 ${status} 原发布范围不再允许重新选择`, async ({ adminApi, page }) => {
    expect(adminApi).toBeDefined()
    await mockWorkOrder(page)
    await page.route('**/api/v1/admin/content-production/work-orders/order**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/publication'))
        return route.fulfill({
          json: {
            work_order_id: 'order',
            token: 'original',
            version: 3,
            collection_hash: 'a'.repeat(64),
            status,
            stage_id: 'original-stage',
            expires_at: '2026-10-15T00:00:00Z',
            candidates: [
              {
                content_type: 'short_reading',
                content_id: item.content_id,
                revision_id: item.revision_id,
                candidate_hash: item.candidate_hash,
                expected_version: 1,
                expected_edit_version: 1,
                warning_codes: []
              }
            ],
            results:
              status === 'PARTIAL'
                ? [
                    {
                      revision_id: item.revision_id,
                      status: 'UNKNOWN',
                      error_code: 'PUBLICATION_ITEM_RESULT_UNKNOWN'
                    }
                  ]
                : []
          }
        })
      if (path.endsWith('/items'))
        return route.fulfill({
          json: {
            items: [{ ...item, current_draft: true, publishable: true }],
            total: 1,
            page: 1,
            page_size: 100,
            version: 1,
            collection_hash: 'members',
            counts: { ...order.counts, total: 1, publishable: 1 }
          }
        })
      return route.fulfill({
        json: {
          ...order,
          publication_token: 'original',
          counts: { ...order.counts, total: 1, publishable: 1 }
        }
      })
    })
    await loginAsAdmin(page)
    await navigateInApp(page, '/content/work-orders/order?view=publication')
    await expect(page.getByRole('heading', { name: '发布失败项目', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '选择当前合格子集', exact: true })).toHaveCount(
      0
    )
    await expect(page.getByRole('button', { name: /确认发布|预览全部合格|仅重试/ })).toHaveCount(0)
  })
}
