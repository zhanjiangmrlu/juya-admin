import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { item, mockWorkOrder, order } from './fixtures/content-work-orders'

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
          counts: order.counts
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
  await expect(page.locator('.metrics')).toContainText('继续保留草稿 1')
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
            counts: order.counts
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
            status: finished ? 'COMPLETED' : 'PREVIEW',
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
    await page.getByText('已核对本次发布范围与来源 / 版权备注', { exact: true }).click()
    await page
      .getByRole('button', {
        name: scenario === 'retry' ? '仅重试 1 篇发布失败 / 待核实结果' : '确认发布 1 篇',
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
