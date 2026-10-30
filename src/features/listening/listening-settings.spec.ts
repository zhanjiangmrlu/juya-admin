import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import ListeningSettings from './listening-settings.vue'
it('retains the original category key and body when the first response is unknown', async () => {
  const writes: Request[] = []
  network.mockImplementation(async (request: Request) => {
    if (request.url.includes('/operations/'))
      return Response.json({ error: { code: 'operation_unknown' } }, { status: 404 })
    if (request.method === 'POST') {
      writes.push(request)
      if (writes.length === 1) throw new Error('lost')
      return Response.json({ id: 'c', name: '分类', revision: 1 })
    }
    if (request.url.endsWith('/free-policy'))
      return Response.json({ configured: false, article_ids: [] })
    return Response.json({ items: [], total: 0 })
  })
  const page = mount(ListeningSettings, {
    props: { initial: 'hierarchy', surface: 'categories' },
    global: { stubs: { RouterLink: true, ElDialog: true } }
  })
  await flushPromises()
  ;(page.vm as unknown as { openEdit: (kind: string) => void }).openEdit('category')
  await flushPromises()
  await page.get('form input').setValue('分类')
  await page.get('form').trigger('submit')
  await flushPromises()
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(writes).toHaveLength(2)
  expect(writes[0]!.headers.get('Idempotency-Key')).toBe(writes[1]!.headers.get('Idempotency-Key'))
  expect(await writes[0]!.json()).toEqual(await writes[1]!.json())
  page.unmount()
})

it('moves an article by dragging and cancels locally without another read', async () => {
  const reads: string[] = []
  network.mockImplementation(async (request: Request) => {
    reads.push(request.url)
    if (request.url.includes('/order?'))
      return Response.json({ article_ids: ['a', 'b'], revision: 3 })
    if (request.url.endsWith('/free-policy'))
      return Response.json({ configured: true, free_count: 1, article_ids: ['a'] })
    if (request.url.includes('/articles?'))
      return Response.json({
        items: ['a', 'b'].map((id) => ({
          id,
          topic_id: 't',
          status: 'published',
          payload: { title_zh: id, title_en: id }
        })),
        total: 2
      })
    return Response.json({ items: [] })
  })
  const page = mount(ListeningSettings, {
    props: { initial: 'order', surface: 'global-order' },
    global: { stubs: { RouterLink: true, ElDialog: true } }
  })
  await flushPromises()
  const initialReads = reads.length
  await page
    .get('[aria-label="拖动排序：a / a"]')
    .trigger('dragstart', { dataTransfer: { setData: vi.fn(), effectAllowed: '' } })
  await page.findAll('.order-row')[1]!.trigger('drop')
  expect(page.findAll('.order-title strong').map((item) => item.text())).toEqual(['b', 'a'])
  await page
    .findAll('button')
    .find((item) => item.text() === '取消调整')!
    .trigger('click')
  expect(page.findAll('.order-title strong').map((item) => item.text())).toEqual(['a', 'b'])
  expect(reads).toHaveLength(initialReads)
  page.unmount()
})

it.each([true, false])(
  'saves M directly and retains input on a failed save (success=%s)',
  async (success) => {
    const writes: Request[] = []
    network.mockImplementation(async (request: Request) => {
      if (request.method === 'PUT') {
        writes.push(request)
        return success
          ? Response.json({ configured: true, free_count: 3, revision: 8, article_ids: [] })
          : Response.json(
              { error: { code: 'listening_free_changed', message: '免费设置已变化' } },
              { status: 409 }
            )
      }
      if (request.url.endsWith('/free-policy'))
        return Response.json({ configured: true, free_count: 1, revision: 7, article_ids: [] })
      return Response.json({ items: [], total: 0 })
    })
    const page = mount(ListeningSettings, {
      props: { initial: 'free' },
      global: { stubs: { RouterLink: true, ElDialog: true } }
    })
    await flushPromises()
    await page.get('.free-input input').setValue('3')
    const saveButton = page.findAll('button').find((item) => item.text() === '保存设置')
    expect(saveButton).toBeDefined()
    await saveButton!.trigger('click')
    await flushPromises()
    expect(writes).toHaveLength(1)
    expect(await writes[0]!.json()).toEqual({ free_count: 3, revision: 7 })
    expect(
      network.mock.calls
        .map((call) => (call[0] as Request).url)
        .some((url) => url.endsWith('/free-policy/preview'))
    ).toBe(false)
    if (success) expect(page.emitted('changed')).toHaveLength(1)
    else {
      expect(page.get<HTMLInputElement>('.free-input input').element.value).toBe('3')
      expect(page.text()).toContain('免费设置已变化')
      expect(page.emitted('changed')).toBeUndefined()
    }
    page.unmount()
  }
)

it('resolves an unknown M save by receipt using its original request key', async () => {
  let firstKey = ''
  const writes: Request[] = []
  network.mockImplementation(async (request: Request) => {
    if (request.url.includes('/operations/')) {
      expect(request.url.endsWith(firstKey)).toBe(true)
      return Response.json({
        result: { configured: true, free_count: 3, revision: 8, article_ids: [] }
      })
    }
    if (request.method === 'PUT') {
      writes.push(request)
      firstKey = request.headers.get('Idempotency-Key')!
      throw new Error('response lost')
    }
    if (request.url.endsWith('/free-policy'))
      return Response.json({ configured: true, free_count: 1, revision: 7, article_ids: [] })
    return Response.json({ items: [], total: 0 })
  })
  const page = mount(ListeningSettings, {
    props: { initial: 'free' },
    global: { stubs: { RouterLink: true, ElDialog: true } }
  })
  await flushPromises()
  await page.get('.free-input input').setValue('3')
  const saveButton = page.findAll('button').find((item) => item.text() === '保存设置')
  expect(saveButton).toBeDefined()
  await saveButton!.trigger('click')
  await flushPromises()
  await page
    .findAll('button')
    .find((item) => item.text() === '重试保存')!
    .trigger('click')
  await flushPromises()
  expect(writes).toHaveLength(1)
  expect(page.emitted('changed')).toHaveLength(1)
  page.unmount()
})

it('deletes only checked catalog objects and retains referenced failures', async () => {
  let items = ['c1', 'c2', 'c3'].map((id) => ({
    id,
    name: id,
    name_en: id,
    revision: 1,
    sort_order: 0
  }))
  const writes: Request[] = []
  network.mockImplementation(async (request: Request) => {
    if (request.url.endsWith('/batch-delete')) {
      writes.push(request)
      items = items.filter((item) => item.id !== 'c1')
      return Response.json({
        items: [
          { id: 'c1', status: 'success', references: {} },
          {
            id: 'c2',
            status: 'failed',
            error: 'listening_catalog_referenced',
            message: '仍有历史引用，不能删除',
            references: { topics: 1 }
          }
        ]
      })
    }
    if (request.url.endsWith('/categories')) return Response.json({ items })
    if (request.url.endsWith('/free-policy'))
      return Response.json({ configured: false, revision: 0, article_ids: [] })
    return Response.json({ items: [], total: 0 })
  })
  const page = mount(ListeningSettings, {
    props: { initial: 'hierarchy', surface: 'categories' },
    global: {
      stubs: {
        RouterLink: true,
        ElDialog: {
          props: ['modelValue'],
          template: '<div v-if="modelValue" role="dialog"><slot/><slot name="footer"/></div>'
        }
      }
    }
  })
  await flushPromises()
  expect(page.find('tbody input[type="checkbox"]').exists()).toBe(true)
  for (const checkbox of page.findAll('tbody input[type="checkbox"]').slice(0, 2))
    await checkbox.setValue(true)
  await page
    .findAll('button')
    .find((item) => item.text() === '批量删除')!
    .trigger('click')
  await page
    .get('[role="dialog"]')
    .findAll('button')
    .find((item) => item.text() === '取消')!
    .trigger('click')
  expect(writes).toHaveLength(0)
  await page
    .findAll('button')
    .find((item) => item.text() === '批量删除')!
    .trigger('click')
  await page
    .get('[role="dialog"]')
    .findAll('button')
    .find((item) => item.text().startsWith('确认删除'))!
    .trigger('click')
  await flushPromises()
  expect(await writes[0]!.json()).toEqual({
    items: [
      { id: 'c1', revision: 1 },
      { id: 'c2', revision: 1 }
    ]
  })
  expect(page.get('tbody').text()).not.toContain('c1')
  expect(page.get('tbody').text()).toContain('c2')
  expect(page.text()).toContain('仍有历史引用，不能删除')
  page.unmount()
})

it('limits catalog selection to ten current-page objects', async () => {
  network.mockImplementation(async (request: Request) => {
    if (request.url.endsWith('/categories'))
      return Response.json({
        items: Array.from({ length: 11 }, (_, i) => ({
          id: `c${i}`,
          name: `分类${i}`,
          name_en: '',
          revision: 1,
          sort_order: i
        }))
      })
    if (request.url.endsWith('/free-policy'))
      return Response.json({ configured: false, revision: 0, article_ids: [] })
    return Response.json({ items: [], total: 0 })
  })
  const page = mount(ListeningSettings, {
    props: { initial: 'hierarchy', surface: 'categories' },
    global: { stubs: { RouterLink: true, ElDialog: true } }
  })
  await flushPromises()
  expect(page.findAll('tbody tr')).toHaveLength(10)
  await page.get('thead input[type="checkbox"]').setValue(true)
  expect(page.text()).toContain('已选当前页10个分类')
  await page
    .findAll('button')
    .find((item) => item.text() === '下一页')!
    .trigger('click')
  expect(page.findAll('tbody tr')).toHaveLength(1)
  expect(page.text()).not.toContain('已选当前页10个分类')
  page.unmount()
})

it('submits a versioned catalog order without exposing numeric sequence inputs', async () => {
  const writes: Request[] = []
  network.mockImplementation(async (request: Request) => {
    if (request.method === 'PUT') {
      writes.push(request)
      return Response.json({ items: [] })
    }
    if (request.url.endsWith('/categories'))
      return Response.json({
        items: ['c1', 'c2'].map((id, sort_order) => ({
          id,
          name: id,
          name_en: '',
          revision: 1,
          sort_order
        }))
      })
    if (request.url.endsWith('/free-policy'))
      return Response.json({ configured: false, revision: 0, article_ids: [] })
    return Response.json({ items: [], total: 0 })
  })
  const page = mount(ListeningSettings, {
    props: { initial: 'hierarchy', surface: 'categories' },
    global: { stubs: { RouterLink: true, ElDialog: true } }
  })
  await flushPromises()
  const adjust = page
    .findAll('tbody tr')[1]!
    .findAll('button')
    .find((item) => item.text() === '调整顺序')
  expect(adjust).toBeDefined()
  await adjust!.trigger('click')
  const move = page
    .findAll('tbody tr')[1]!
    .findAll('button')
    .find((item) => item.attributes('aria-label') === '上移c2')
  expect(move).toBeDefined()
  await move!.trigger('click')
  await flushPromises()
  expect(await writes[0]!.json()).toEqual({
    items: [
      { id: 'c2', revision: 1 },
      { id: 'c1', revision: 1 }
    ]
  })
  expect(writes[0]!.url).toContain('/categories/order')
  page.unmount()
})
