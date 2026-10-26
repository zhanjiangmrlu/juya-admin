import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
import applicationRouter from '@/router'
import { ApiError } from '@/services/http-client'
import { useAdminStore } from '@/stores/admin-store'

const feedback = {
  id: 'FB1001',
  user_id: 'U1001',
  user_code: 'Juya001',
  category: 'content',
  status: 'pending',
  summary: '释义需要核对',
  source: 'scene',
  card_id: 'card-one',
  version_id: 'version-one',
  source_title: '晨间活动',
  source_title_en: 'Morning movement',
  source_available: false,
  source_unavailable_reason: 'deleted',
  created_at: '2026-10-21T11:20:00Z',
  updated_at: '2026-10-22T01:10:00Z',
  unread: true,
  latest_event_id: 7,
  events: [
    {
      id: 7,
      actor: 'user',
      text: '释义需要核对',
      status: null,
      images: [],
      created_at: '2026-10-21T11:20:00Z'
    }
  ]
}

/** 从真实注册的路由挂载反馈页面
 * @param path 列表条件或详情目标
 * @param cached 是否以应用相同的KeepAlive容器挂载
 * @returns 当前页面与内存路由
 */
const open = async (path: string, cached = false) => {
  const list = applicationRouter.getRoutes().find((item) => item.path === '/feedback')
  const detail = applicationRouter.getRoutes().find((item) => item.path === '/feedback/:id')
  expect(list, '问题反馈列表需要注册独立路由').toBeDefined()
  expect(detail, '反馈详情需要注册独立路由').toBeDefined()
  const router = createRouter({ history: createMemoryHistory(), routes: [list!, detail!] })
  await router.push(path)
  await router.isReady()
  const page = mount(
    {
      template: cached
        ? '<RouterView v-slot="{ Component }"><KeepAlive include="FeedbackListPage"><component :is="Component" /></KeepAlive></RouterView>'
        : '<RouterView />'
    },
    {
      attachTo: document.body,
      global: { plugins: [router], stubs: { ElDialog: true } }
    }
  )
  await flushPromises()
  return { page, router }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  request.mockReset()
  sessionStorage.clear()
  document.body.innerHTML = ''
  setActivePinia(createPinia())
  useAdminStore().identity = { id: 'admin-one', username: 'admin' }
})

it('queries server search and status without clearing list unread', async () => {
  request.mockResolvedValue({ items: [{ ...feedback, events: [] }], total: 1, page: 1, limit: 10 })
  const { page, router } = await open('/feedback?status=needs_info&search=释义')
  const url = new URL(request.mock.calls[0]![0], 'https://example.test')
  expect(Object.fromEntries(url.searchParams)).toEqual({
    search: '释义',
    status: 'needs_info',
    page: '1',
    limit: '10'
  })
  expect(page.find('img[alt="未读用户补充"]').exists()).toBe(true)
  expect(page.text()).toContain('晨间活动')
  expect(page.text()).toContain('Juya001')
  expect(page.text()).toContain('FB1001')
  expect(page.get('tbody').text()).not.toContain('U1001')
  expect(page.text()).toContain('已删除')
  expect(request.mock.calls.every(([, options]) => !options?.method)).toBe(true)
  await page.get('input[type="search"]').setValue('U1001')
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(router.currentRoute.value.query).toMatchObject({
    search: 'U1001',
    status: 'needs_info',
    page: '1'
  })
  page.unmount()
})

it('keeps trusted list rows visible when refresh fails instead of reporting empty', async () => {
  request
    .mockResolvedValueOnce({ items: [{ ...feedback, events: [] }], total: 1, page: 1, limit: 10 })
    .mockRejectedValue(new Error('暂时无法读取反馈'))
  const { page } = await open('/feedback')
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(page.text()).toContain('FB1001')
  expect(page.text()).toContain('暂时无法读取反馈')
  expect(page.text()).not.toContain('暂无反馈')
  page.unmount()
})

it('acknowledges only a rendered snapshot and refreshes unread after the minimal acknowledgement', async () => {
  let rendered = false
  request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method === 'PUT') {
      rendered = document.body.textContent?.includes('释义需要核对') || false
      return { feedback_id: feedback.id, read_event_id: 7 }
    }
    if (path.endsWith('/unread')) return { unread: true, count: 2 }
    return feedback
  })
  const { page } = await open('/feedback/FB1001?back=%2Ffeedback%3Fstatus%3Dpending')
  expect(page.text()).toContain('释义需要核对')
  expect(request.mock.calls.find(([path]) => path.endsWith('/read'))?.[1]).toMatchObject({
    method: 'PUT',
    body: { event_id: 7 }
  })
  expect(request.mock.calls.some(([path]) => path.endsWith('/unread'))).toBe(true)
  expect(page.get('[data-action="feedback-back"]').attributes('href')).toBe(
    '/feedback?status=pending'
  )
  expect(rendered).toBe(true)
  page.unmount()
})

it('keeps read acknowledgement failure separate from the displayed timeline and allows retry', async () => {
  request.mockImplementation(async (_path: string, options?: { method?: string }) => {
    if (options?.method === 'PUT') throw new Error('已读更新失败')
    return feedback
  })
  const { page } = await open('/feedback/FB1001')
  expect(page.text()).toContain('释义需要核对')
  expect(page.text()).toContain('已读更新失败')
  expect(page.find('[data-action="retry-read"]').exists()).toBe(true)
  page.unmount()
})

it('requires text for resolution and preserves text and server state on conflict', async () => {
  request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method === 'POST')
      throw new ApiError('feedback_changed', '反馈已有新补充，请重新核对', 409)
    if (path.endsWith('/unread')) return { unread: false, count: 0 }
    return feedback
  })
  const { page } = await open('/feedback/FB1001')
  await page.get('[data-status="resolved"]').trigger('click')
  expect(page.get('[data-action="send-feedback"]').attributes('disabled')).toBeDefined()
  await page.get('textarea').setValue('已核对并修正说明')
  await page.get('form.feedback-handle').trigger('submit')
  await flushPromises()
  expect((page.get('textarea').element as HTMLTextAreaElement).value).toBe('已核对并修正说明')
  expect(page.get('[data-current-status]').text()).toBe('待处理')
  expect(page.text()).toContain('反馈已有新补充')
  expect(request.mock.calls.find(([, options]) => options?.method === 'POST')?.[1]).toMatchObject({
    body: { text: '已核对并修正说明', status: 'resolved', expected_latest_event_id: 7 }
  })
  page.unmount()
})

it('queries an unknown reply then reloads the current timeline without posting a duplicate', async () => {
  let recovered = false
  request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method === 'POST') throw new ApiError('network_unknown', '响应未知')
    if (path.includes('/operations/')) {
      recovered = true
      return {
        status: 'succeeded',
        result: { ...feedback, status: 'processing', latest_event_id: 8 }
      }
    }
    if (recovered && !options?.method)
      return {
        ...feedback,
        events: [...feedback.events, { ...feedback.events[0], id: 9, text: '后来追加的新问题' }],
        latest_event_id: 9
      }
    if (path.endsWith('/unread')) return { unread: false, count: 0 }
    return feedback
  })
  const { page } = await open('/feedback/FB1001')
  await page.get('textarea').setValue('我们正在核对')
  await page.get('form.feedback-handle').trigger('submit')
  await flushPromises()
  expect(page.find('[data-action="resolve-feedback"]').exists()).toBe(true)
  const mutation = request.mock.calls.find(([, options]) => options?.method === 'POST')!
  await page.get('[data-action="resolve-feedback"]').trigger('click')
  await flushPromises()
  expect(
    request.mock.calls.some(([path]) => path === `/api/admin/v1/operations/${mutation[1].key}`)
  ).toBe(true)
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  expect(page.get('[data-current-status]').text()).toBe('待处理')
  expect(page.text()).toContain('后来追加的新问题')
  expect((page.get('textarea').element as HTMLTextAreaElement).value).toBe('')
  page.unmount()
})

it('retains the confirmed recovery snapshot when refreshing the latest timeline fails', async () => {
  let recovered = false
  request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method === 'POST') throw new ApiError('network_unknown', '响应未知')
    if (path.includes('/operations/')) {
      recovered = true
      return { status: 'succeeded', result: { ...feedback, unread: false, status: 'processing' } }
    }
    if (recovered) throw new Error('最新记录刷新失败')
    return { ...feedback, unread: false }
  })
  const { page } = await open('/feedback/FB1001')
  await page.get('textarea').setValue('正在核对')
  await page.get('form.feedback-handle').trigger('submit')
  await flushPromises()
  await page.get('[data-action="resolve-feedback"]').trigger('click')
  await flushPromises()
  expect(page.get('[data-current-status]').text()).toBe('处理中')
  expect(page.text()).toContain('最新记录刷新失败')
  expect(page.get('[data-action="send-feedback"]').attributes('disabled')).toBeDefined()
  page.unmount()
})

it('restores an expired session draft only for its original administrator and queries before resubmission', async () => {
  request.mockImplementation(async (_path: string, options?: { method?: string }) => {
    if (options?.method === 'POST') throw new ApiError('network_unknown', '响应未知')
    return { ...feedback, id: 'draft-one', unread: false }
  })
  const first = await open('/feedback/draft-one')
  await first.page.get('textarea').setValue('会话到期前的私密草稿')
  await first.page.get('form.feedback-handle').trigger('submit')
  await flushPromises()
  useAdminStore().clear()
  first.page.unmount()
  expect(JSON.stringify({ ...sessionStorage })).not.toContain('私密草稿')
  useAdminStore().identity = { id: 'admin-other', username: 'other' }
  const other = await open('/feedback/draft-one')
  expect((other.page.get('textarea').element as HTMLTextAreaElement).value).toBe('')
  other.page.unmount()
  useAdminStore().identity = { id: 'admin-one', username: 'admin' }
  const restored = await open('/feedback/draft-one')
  expect((restored.page.get('textarea').element as HTMLTextAreaElement).value).toBe(
    '会话到期前的私密草稿'
  )
  expect(restored.page.find('[data-action="resolve-feedback"]').exists()).toBe(true)
  expect(restored.page.get('[data-action="send-feedback"]').attributes('disabled')).toBeDefined()
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  restored.page.unmount()
})

it('loads a new detail target while the prior target is still reading and ignores its late response', async () => {
  let finishFirst!: (value: unknown) => void
  request.mockImplementation(async (path: string) => {
    if (path.endsWith('/first'))
      return new Promise((resolve) => {
        finishFirst = resolve
      })
    return { ...feedback, id: 'second', summary: '第二条反馈', unread: false, events: [] }
  })
  const { page, router } = await open('/feedback/first')
  await router.push('/feedback/second')
  await flushPromises()
  expect(page.text()).toContain('second')
  expect(page.text()).not.toContain('正在加载')
  finishFirst({ ...feedback, id: 'first', unread: false })
  await flushPromises()
  expect(page.text()).toContain('second')
  expect(page.text()).not.toContain('FB1001')
  page.unmount()
})

it('restores the list scroll and query after visiting detail, resetting only an explicit filter change', async () => {
  let scroll = 0
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scroll)
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((...values: unknown[]) => {
    const options = values[0] as ScrollToOptions
    if (typeof options === 'object') scroll = options.top || 0
  })
  request.mockImplementation(async (path: string) =>
    path.includes('/feedback?')
      ? { items: [{ ...feedback, events: [] }], total: 30, page: 2, limit: 10 }
      : { ...feedback, unread: false }
  )
  const { page, router } = await open('/feedback?status=pending&page=2', true)
  scroll = 480
  await page.get('tbody a').trigger('click')
  await flushPromises()
  scroll = 0
  await page.get('[data-action="feedback-back"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/feedback?status=pending&page=2')
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 480 })
  await page.get('.segments button').trigger('click')
  await flushPromises()
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 0 })
  page.unmount()
  vi.restoreAllMocks()
})

it('queries an unknown read receipt before retrying and then rereads aggregate unread', async () => {
  request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method === 'PUT') throw new ApiError('network_unknown', '已读结果未知')
    if (path.includes('/operations/'))
      return { status: 'succeeded', result: { feedback_id: feedback.id, read_event_id: 7 } }
    if (path.endsWith('/unread')) return { unread: true, count: 2 }
    return feedback
  })
  const { page } = await open('/feedback/FB1001')
  const key = request.mock.calls.find(([, options]) => options?.method === 'PUT')![1].key
  await page.get('[data-action="retry-read"]').trigger('click')
  await flushPromises()
  expect(request.mock.calls.some(([path]) => path === `/api/admin/v1/operations/${key}`)).toBe(true)
  expect(request.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1)
  expect(request.mock.calls.at(-1)![0]).toBe('/api/admin/v1/feedback/unread')
  page.unmount()
})

it.each(['activate', 'same-filter', 'changed-filter'])(
  'does not scroll a detail after a stale %s list refresh finishes',
  async (trigger) => {
    let listReads = 0,
      finishList!: (value: unknown) => void,
      scroll = 300
    const rows = { items: [{ ...feedback, events: [] }], total: 1, page: 1, limit: 10 }
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scroll)
    const scrollTo = vi.spyOn(window, 'scrollTo')
    request.mockImplementation(async (path: string) => {
      if (path.includes('/feedback?')) {
        if (++listReads > 1)
          return new Promise((resolve) => {
            finishList = resolve
          })
        return rows
      }
      return { ...feedback, unread: false }
    })
    const { page, router } = await open('/feedback?status=pending&page=1', true)
    if (trigger === 'activate') {
      await page.get('tbody a').trigger('click')
      await flushPromises()
      await page.get('[data-action="feedback-back"]').trigger('click')
    } else if (trigger === 'same-filter') await page.get('form').trigger('submit')
    else await page.get('.segments button').trigger('click')
    await flushPromises()
    scroll = 300
    await page.get('tbody a').trigger('click')
    await flushPromises()
    scroll = 0
    scrollTo.mockClear()
    finishList(rows)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/feedback/FB1001')
    expect(scrollTo).not.toHaveBeenCalled()
    page.unmount()
  }
)
