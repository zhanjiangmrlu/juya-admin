import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { item, mockWorkOrder, reading, scene } from './fixtures/content-work-orders'

test('同一目录搜索双语标题并按类型过滤，短文进入所属工作单修正', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const requests = await mockWorkOrder(page)
  await page.route('**/work-orders/order/items/one', (route) =>
    route.fulfill({
      json: {
        ...item,
        content_id: 'READING-1',
        current: { template: 'short_reading', content: reading }
      }
    })
  )
  const rows = [
    {
      id: 'SCENE-1',
      content_type: 'dialogue',
      title_en: 'Coffee',
      title_zh: '咖啡店',
      status: 'PUBLISHED'
    },
    {
      id: 'READING-1',
      content_type: 'short_reading',
      title_en: 'Garden',
      title_zh: '城市花园',
      status: 'DRAFT'
    }
  ].map((row) => ({
    ...row,
    series_id: 'SERIES-1',
    series_title: '日常英语',
    draft_revision_id: 'REV-DRAFT-1',
    published_revision_id: null,
    updated_at: null
  }))
  let query = ''
  await page.route('**/api/v1/admin/content/catalogue**', (route) => {
    const params = new URL(route.request().url()).searchParams
    query = params.toString()
    const result = rows.filter(
      (row) =>
        (!params.get('content_type') || row.content_type === params.get('content_type')) &&
        (!params.get('query') || row.title_zh.includes(params.get('query')!))
    )
    return route.fulfill({ json: { items: result, total: result.length, page: 1, page_size: 10 } })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes')
  await expect(page.getByText('Coffee｜咖啡店')).toBeVisible()
  await expect(page.getByText('Garden｜城市花园')).toBeVisible()
  await page.getByRole('combobox', { name: '内容类型筛选' }).press('Enter')
  await page.getByRole('option', { name: '短文阅读', exact: true }).click()
  await expect(page.getByText('Coffee｜咖啡店')).toHaveCount(0)
  await page.getByRole('textbox', { name: '关键词' }).fill('城市')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('Garden｜城市花园')).toBeVisible()
  expect(query).toContain('content_type=short_reading')
  expect(new URLSearchParams(query).get('query')).toBe('城市')
  expect(new URLSearchParams(query).get('page')).toBe('1')
  await page.getByRole('button', { name: '继续校对', exact: true }).click()
  await expect(page).toHaveURL(/content\/work-orders\/order\/items\/one/)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Current reading', exact: true })
  ).toBeVisible()
  const contexts = requests.filter((request) => request.path.endsWith('/contexts'))
  expect(
    contexts.some(
      (request) =>
        request.body.content_type === 'dialogue' &&
        JSON.stringify(request.body.content_ids) === '["SCENE-1"]'
    )
  ).toBe(true)
  expect(
    contexts.some(
      (request) =>
        request.body.content_type === 'short_reading' &&
        JSON.stringify(request.body.content_ids) === '["READING-1"]'
    )
  ).toBe(true)
  expect(adminApi.unexpectedRequests).toEqual([])
})

test('生成候选的迟到响应不会把已经离页的管理员导航回编辑器', async ({ adminApi, page }) => {
  const requests = await mockWorkOrder(page, { template: 'dialogue', content: scene })
  let release = (): void => {}
  let requested = false
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/admin/content/catalogue**', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'SCENE-1',
            content_type: 'dialogue',
            title_en: 'Coffee',
            title_zh: '咖啡店',
            series_id: 'SERIES-1',
            series_title: '日常英语',
            status: 'PUBLISHED',
            draft_revision_id: null,
            published_revision_id: 'REV-1',
            updated_at: null
          }
        ],
        total: 1,
        page: 1,
        page_size: 10
      }
    })
  )
  await page.route('**/api/v1/admin/content/scenes/SCENE-1/revisions', async (route) => {
    requested = true
    await pending
    return route.fulfill({
      json: {
        id: 'REV-2',
        scene_id: 'SCENE-1',
        status: 'DRAFT',
        version: 1,
        content: {},
        stable_entry_ids: [],
        stable_sentence_ids: [],
        created_at: '2026-10-11T00:00:00Z',
        created_by: 'ADMIN-1',
        source_revision_id: 'REV-1'
      }
    })
  })
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/scenes')
  await page.getByRole('button', { name: '查看 · 编辑新版本', exact: true }).click()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('menuitem', { name: '工作台', exact: true }).click()
  const delivered = page.waitForResponse((response) =>
    response.url().endsWith('/content/scenes/SCENE-1/revisions')
  )
  release()
  await (await delivered).finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(page.getByRole('heading', { level: 1, name: '工作台' })).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect(adminApi.unexpectedRequests).toEqual([])
  expect(
    requests
      .filter((request) => request.path.endsWith('/contexts'))
      .every(
        (request) =>
          request.body.content_type === 'dialogue' &&
          JSON.stringify(request.body.content_ids) === '["SCENE-1"]'
      )
  ).toBe(true)
})
