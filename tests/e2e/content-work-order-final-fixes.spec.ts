import { expect, loginAsAdmin, navigateInApp, test } from './fixtures/admin-api'
import { item, mockWorkOrder, order, reading, scene } from './fixtures/content-work-orders'

for (const delay of ['detail', 'binding', 'save', 'upload'] as const) {
  test(`编辑 A 的 ${delay} 迟到后保持 B 身份与未保存输入`, async ({ adminApi, page }) => {
    expect(adminApi).toBeDefined()
    await mockWorkOrder(page)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let held = false
    let completed = false
    const seen: string[] = []
    const bodies: Record<string, unknown>[] = []
    const content = delay === 'binding' ? scene : reading
    const template = delay === 'binding' ? 'word_card' : 'short_reading'
    await page.route(/\/work-orders\/(A|B)\/items\//, async (route) => {
      const path = new URL(route.request().url()).pathname
      const name = path.includes('/A/') ? 'A' : 'B'
      seen.push(`${route.request().method()} ${path}`)
      if (path.endsWith('/correction')) bodies.push(route.request().postDataJSON())
      if (
        name === 'A' &&
        ((delay === 'detail' && path.endsWith('/a')) ||
          (delay === 'binding' && path.endsWith('/entry-bindings')) ||
          (delay === 'save' && path.endsWith('/correction')))
      ) {
        held = true
        await gate
      }
      await route.fulfill({
        json: path.endsWith('/entry-bindings')
          ? { bindings: [] }
          : path.endsWith('/correction')
            ? {}
            : {
                ...item,
                work_order_id: name,
                item_id: name.toLowerCase(),
                content_id: `content-${name}`,
                revision_id: `revision-${name}`,
                title_en: `Content ${name}`,
                issues: [],
                current: { template, content: { ...content, title_en: `Content ${name}` } }
              }
      })
      if (name === 'A' && held) completed = true
    })
    await page.route('**/work-orders/*', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)!
      return route.fulfill({ json: { ...order, work_order_id: name, content_type: template } })
    })
    await page.route('**/media/upload-policies', (route) =>
      route.fulfill({
        json: { upload_url: '/fixture-upload', fields: { key: 'fixture/${filename}' } }
      })
    )
    await page.route('**/fixture-upload', (route) => route.fulfill({ status: 204 }))
    await page.route('**/media/uploads/confirm', async (route) => {
      held = true
      await gate
      await route.fulfill({ json: { id: 'old-A-cover' } })
      completed = true
    })
    await loginAsAdmin(page)
    await navigateInApp(page, '/content/work-orders/A/items/a')
    if (delay === 'save') {
      await expect(page.getByRole('heading', { name: 'Content A', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
    }
    if (delay === 'upload') {
      await expect(page.getByRole('heading', { name: 'Content A', exact: true })).toBeVisible()
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles({
          name: 'cover.png',
          mimeType: 'image/png',
          buffer: Buffer.from('local fixture')
        })
    }
    await expect.poll(() => held).toBe(true)
    await navigateInApp(page, '/content/work-orders/B/items/b')
    await expect(page.getByRole('heading', { name: 'Content B', exact: true })).toBeVisible()
    if (template === 'short_reading') await page.getByText('编辑元信息', { exact: true }).click()
    await page.getByLabel('英文标题', { exact: true }).fill('Unsaved B')
    release()
    await expect.poll(() => completed).toBe(true)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await expect.poll(() => seen.some((path) => path.includes('/B/items/b'))).toBe(true)
    await expect(page.getByLabel('英文标题', { exact: true })).toHaveValue('Unsaved B')
    await page.getByRole('button', { name: '保存候选修正', exact: true }).click()
    await expect
      .poll(() =>
        seen.some(
          (path) => path === 'PUT /api/v1/admin/content-production/work-orders/B/items/b/correction'
        )
      )
      .toBe(true)
    expect(
      (bodies.at(-1)?.current as { content: { cover_asset_id: string | null } }).content
        .cover_asset_id
    ).toBeNull()
    await expect(page).toHaveURL(/\/B\/items\/b$/)
  })
}

test('动态问题无历史确认框，阅读试听进入正式抽样且可重建旧集合', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  const requests = await mockWorkOrder(page, {
    template: 'short_reading',
    content: {
      ...reading,
      audio: { asset_id: 'audio', version_id: 'version', target_id: 'target', duration_ms: 8900 }
    }
  })
  await page.route('**/work-orders/order/sampling', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const count = requests.filter(
      (row) => row.method === 'POST' && row.path.endsWith('/sampling')
    ).length
    return route.fulfill({
      json: {
        work_order_id: 'order',
        proofreading_set_id: `set-${count}`,
        collection_hash: `hash-${count}`,
        status: 'PENDING',
        normal_count: 1,
        sample_ids: ['revision'],
        confirmed_revision_ids: [],
        candidates: [
          {
            revision_id: 'revision',
            candidate_hash: item.candidate_hash,
            content_type: 'short_reading',
            content_id: 'reading',
            normal: true
          }
        ]
      }
    })
  })
  await page.route('**/media/assets/audio/signed-url', (route) =>
    route.fulfill({ json: { url: '/local-audio.wav' } })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/order/items/one')
  await expect(
    page.getByText('已实际试听完整音频，确认与本篇正文一致', { exact: true })
  ).toHaveCount(0)
  await expect(page.getByText('已处理：请核对完整译文', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '保存后前往抽样试听确认' }).click()
  await expect(page).toHaveURL(/view=sampling/)
  await page.getByRole('button', { name: '建立本批抽样', exact: true }).click()
  await expect(page.getByRole('button', { name: '按当前草稿重新建立抽样' })).toBeVisible()
  await page.getByRole('button', { name: '按当前草稿重新建立抽样' }).click()
  await expect
    .poll(
      () => requests.filter((row) => row.method === 'POST' && row.path.endsWith('/sampling')).length
    )
    .toBe(2)
  await expect(page.locator('audio[src="/local-audio.wav"]')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认已检查本篇', exact: true })).toBeDisabled()
  expect(requests.find((row) => row.path.endsWith('/correction'))?.body.resolved_issue_ids).toEqual(
    []
  )
})

test('A 工作单成员分页迟到不能替换 B 的发布选择', async ({ adminApi, page }) => {
  expect(adminApi).toBeDefined()
  await mockWorkOrder(page)
  let release!: () => void
  let held = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/work-orders/*/items?*', async (route) => {
    const url = new URL(route.request().url()),
      name = url.pathname.includes('/A/') ? 'A' : 'B'
    if (name === 'A' && url.searchParams.get('page_size') === '100') {
      held = true
      await gate
    }
    await route.fulfill({
      json: {
        items: [
          {
            ...item,
            item_id: name,
            title_en: `Publish ${name}`,
            publishable: true,
            current_draft: true
          }
        ],
        total: 1
      }
    })
  })
  await page.route('**/work-orders/*', (route) =>
    route.fulfill({
      json: {
        ...order,
        work_order_id: new URL(route.request().url()).pathname.split('/').at(-1)!,
        counts: { ...order.counts, publishable: 1 }
      }
    })
  )
  await loginAsAdmin(page)
  await navigateInApp(page, '/content/work-orders/A?view=publication')
  await expect.poll(() => held).toBe(true)
  await navigateInApp(page, '/content/work-orders/B?view=publication')
  await expect(page.getByText('Publish B', { exact: true })).toBeVisible()
  release()
  await expect(page.getByText('Publish A', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Publish B', { exact: true })).toBeVisible()
})
