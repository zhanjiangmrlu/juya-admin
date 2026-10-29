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
  'requires a separate confirmation and exits a stale free policy confirmation (success=%s)',
  async (success) => {
    const writes: string[] = []
    network.mockImplementation(async (request: Request) => {
      if (request.method !== 'GET') writes.push(request.method)
      if (request.method === 'PUT' && !success)
        return Response.json(
          { error: { code: 'listening_free_preview_stale', message: '名单已变化，请重新预览' } },
          { status: 409 }
        )
      if (request.url.endsWith('/free-policy/preview'))
        return Response.json({
          preview_token: 'p',
          free_count: 1,
          revision: 1,
          article_ids: ['a'],
          added_ids: ['a'],
          removed_ids: []
        })
      if (request.url.endsWith('/free-policy'))
        return Response.json({ configured: true, free_count: 1, article_ids: [] })
      return Response.json({ items: [], total: 0 })
    })
    const page = mount(ListeningSettings, {
      props: { initial: 'free' },
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
    await page
      .findAll('button')
      .find((item) => item.text() === '预览名单与影响')!
      .trigger('click')
    await flushPromises()
    await page
      .findAll('button')
      .find((item) => item.text() === '保存免费设置')!
      .trigger('click')
    expect(writes).toEqual(['POST'])
    expect(page.get('[role="dialog"]').text()).toContain('确认保存M与名单')
    await page
      .findAll('button')
      .find((item) => item.text() === '确认保存M与名单')!
      .trigger('click')
    await flushPromises()
    expect(writes).toEqual(['POST', 'PUT'])
    expect(page.find('[role="dialog"]').exists()).toBe(false)
    if (!success) expect(page.text()).toContain('名单已变化，请重新预览')
    page.unmount()
  }
)

it('rejects a late M1 preview after the input changes to M3 and confirms only the matching snapshot', async () => {
  let resolvePreview: (response: Response) => void = () => undefined
  const submitted: number[] = []
  network.mockImplementation(async (request: Request) => {
    if (request.url.endsWith('/free-policy/preview')) {
      submitted.push((await request.json()).free_count)
      return new Promise<Response>((resolve) => {
        resolvePreview = resolve
      })
    }
    if (request.url.endsWith('/free-policy'))
      return Response.json({ configured: true, free_count: 1, article_ids: [] })
    return Response.json({ items: [], total: 0 })
  })
  const page = mount(ListeningSettings, {
    props: { initial: 'free' },
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
  await page
    .findAll('button')
    .find((button) => button.text() === '预览名单与影响')!
    .trigger('click')
  await flushPromises()
  const input = page.get<HTMLInputElement>('.free-input input')
  input.element.value = '3'
  input.element.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
  resolvePreview(
    Response.json({
      preview_token: 'old-m1',
      free_count: 1,
      revision: 1,
      article_ids: ['a'],
      added_ids: [],
      removed_ids: []
    })
  )
  await flushPromises()
  expect(submitted).toEqual([1])
  expect(page.findAll('button').some((button) => button.text() === '保存免费设置')).toBe(false)
  expect(page.find('[role="dialog"]').exists()).toBe(false)
  await page
    .findAll('button')
    .find((button) => button.text() === '预览名单与影响')!
    .trigger('click')
  await flushPromises()
  expect(page.get('.free-input input').attributes('disabled')).toBeDefined()
  resolvePreview(
    Response.json({
      preview_token: 'current-m3',
      free_count: 3,
      revision: 1,
      article_ids: ['a'],
      added_ids: [],
      removed_ids: []
    })
  )
  await flushPromises()
  expect(submitted).toEqual([1, 3])
  await page
    .findAll('button')
    .find((button) => button.text() === '保存免费设置')!
    .trigger('click')
  expect(page.get('[role="dialog"] .policy-summary').text()).toContain('调整后免费篇数 3')
  page.unmount()
})
