import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
import { clearClientThumbnails } from '@/services/client-thumbnail'

import SceneListPage from './scene-list-page.vue'

afterEach(() => {
  vi.useRealTimers()
  sessionStorage.clear()
})

it('filters with status segments and clears the previous page selection', async () => {
  request.mockImplementation(async (path: string) => {
    if (!path.startsWith('/api/admin/v1/cards?')) return []
    const query = new URL(path, 'http://test').searchParams
    return {
      total: 11,
      page: Number(query.get('page')),
      limit: 10,
      total_pages: 2,
      items: [
        {
          id: 'selected-card',
          display_name: 'Coffee',
          display_title_en: 'Coffee',
          status: query.get('status') === 'draft' ? 'draft' : 'published',
          content: { name: 'Coffee' },
          issues: [],
          updated_at: ''
        }
      ]
    }
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/cards', component: SceneListPage }]
  })
  await router.push('/cards?search=coffee&page=2')
  const wrapper = mount(
    {
      template:
        '<RouterView v-slot="{ Component }"><KeepAlive><component :is="Component"/></KeepAlive></RouterView>'
    },
    {
      global: { plugins: [router], stubs: { ElDialog: true } }
    }
  )
  await flushPromises()
  await wrapper.get('input[aria-label="选择本页卡片"]').setValue(true)
  const draft = wrapper.findAll('button[aria-pressed]').find((button) => button.text() === '草稿')
  expect(draft, '草稿筛选应为可操作的分段按钮').toBeDefined()
  await draft!.trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toMatchObject({
    search: 'coffee',
    status: 'draft',
    page: '1'
  })
  expect(wrapper.get('input[aria-label="选择本页卡片"]').element).toHaveProperty('checked', false)
  expect(
    request.mock.calls.some(([path]) => path.includes('status=draft') && path.includes('limit=10'))
  ).toBe(true)
  wrapper.unmount()
})

it.each(['offline', 'delete'] as const)(
  'updates the list when %s completes after its dialog was closed',
  async (action) => {
    vi.useFakeTimers()
    let accepted = false,
      finished = false
    const card = {
      id: 'one',
      display_name: '异步卡片',
      status: 'published',
      draft_revision: 1,
      current_version_id: 'v1',
      content: { name: '异步卡片' },
      issues: [],
      updated_at: ''
    }
    const batch = () => ({
      id: 'batch',
      action,
      created_at: '',
      items: [
        {
          id: 'item',
          card_id: 'one',
          name: '异步卡片',
          state: finished ? 'succeeded' : 'queued',
          job_id: 'job',
          error_code: null,
          needs_review: false
        }
      ]
    })
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path.startsWith('/api/admin/v1/cards?')) {
        const items =
          finished && action === 'delete'
            ? []
            : [{ ...card, status: finished ? 'offline' : 'published' }]
        return { items, total: items.length, page: 1, limit: 10, total_pages: items.length ? 1 : 0 }
      }
      if (path === '/api/admin/v1/cards/one') return card
      if (path === '/api/admin/v1/card-action-batches' && options?.method === 'POST') {
        accepted = true
        return batch()
      }
      if (path === '/api/admin/v1/card-action-batches') return accepted ? [batch()] : []
      if (path === '/api/admin/v1/card-action-batches/batch') return batch()
      return []
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cards', component: SceneListPage }]
    })
    await router.push('/cards')
    await router.isReady()
    const wrapper = mount(
      {
        template:
          '<RouterView v-slot="{ Component }"><KeepAlive><component :is="Component"/></KeepAlive></RouterView>'
      },
      {
        global: {
          plugins: [router],
          stubs: { ElDialog: { template: '<section><slot/><slot name="footer"/></section>' } }
        }
      }
    )
    await flushPromises()
    await wrapper.get('input[aria-label="选择本页卡片"]').setValue(true)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === (action === 'offline' ? '批量下线' : '批量删除'))!
      .trigger('click')
    await flushPromises()
    await wrapper.get('[data-action="confirm-card-actions"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-action="close-card-actions"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-action="close-card-actions"]').exists()).toBe(false)
    if (action === 'delete') await vi.advanceTimersByTimeAsync(45000)
    finished = true
    await vi.advanceTimersByTimeAsync(action === 'delete' ? 11000 : 2000)
    await flushPromises()
    if (action === 'offline') expect(wrapper.get('tbody').text()).toContain('已下线')
    else expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    wrapper.unmount()
    const calls = request.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(request.mock.calls).toHaveLength(calls)
  }
)

it('never lets a delayed list response rewrite the editor route', async () => {
  let finish: (value: unknown) => void = () => {}
  request.mockImplementation((path: string) =>
    path.startsWith('/api/admin/v1/cards?')
      ? new Promise((resolve) => {
          if (path.includes('page=3')) finish = resolve
        })
      : Promise.resolve([])
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cards', component: SceneListPage },
      { path: '/:pathMatch(.*)*', component: { template: '<div>editor</div>' } }
    ]
  })
  await router.push('/cards?page=3')
  await router.isReady()
  const wrapper = mount(
    { components: { SceneListPage }, template: '<KeepAlive><SceneListPage/></KeepAlive>' },
    { global: { plugins: [router], stubs: { ElDialog: true } } }
  )
  await flushPromises()
  await router.push('/cards/editor?back=original')
  finish({ items: [], total: 11, page: 2, limit: 10, total_pages: 2 })
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/cards/editor?back=original')
  wrapper.unmount()
})

it('requests server pages of ten, clears selection on paging and shows real bounds', async () => {
  request.mockImplementation(async (path: string) => {
    if (!path.startsWith('/api/admin/v1/cards?')) return []
    const url = new URL(path, 'http://test'),
      page = Number(url.searchParams.get('page'))
    return {
      total: 21,
      page,
      limit: 10,
      total_pages: 3,
      items: Array.from({ length: 10 }, (_, index) => ({
        id: `${page}-${index}`,
        display_name: `卡片${page}-${index}`,
        display_thumbnail_id: null,
        display_image_id: null,
        content: { name: '卡片' },
        status: 'draft',
        draft_revision: 1,
        current_version_id: null,
        issues: [],
        updated_at: ''
      }))
    }
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cards', component: SceneListPage },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } }
    ]
  })
  await router.push('/cards')
  await router.isReady()
  const wrapper = mount(
    { components: { SceneListPage }, template: '<KeepAlive><SceneListPage/></KeepAlive>' },
    { global: { plugins: [router], stubs: { ElDialog: true } } }
  )
  await flushPromises()
  expect(
    request.mock.calls.find(([path]) => path.startsWith('/api/admin/v1/cards?'))?.[0]
  ).toContain('limit=10')
  await wrapper.get('input[aria-label="选择本页卡片"]').setValue(true)
  expect(wrapper.text()).toContain('已选择 10 张')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).not.toContain('已选择 10 张')
  expect(wrapper.text()).toContain('第 2 / 3 页')
  wrapper.unmount()
})

it('keeps the original out of the list, lazy loads thumbnails and offers a fresh retry after failure', async () => {
  const card = {
    id: 'image-card',
    display_name: '场景',
    display_title_en: 'Scene',
    status: 'published',
    draft_revision: 1,
    current_version_id: 'version-1',
    display_thumbnail_id: 'published-thumb',
    display_image_id: 'published-original',
    content: { name: '候选', image_id: 'candidate-original' },
    issues: [],
    updated_at: ''
  }
  request.mockImplementation(async (path: string) =>
    path.startsWith('/api/admin/v1/cards?')
      ? { items: [card], total: 1, page: 1, limit: 10, total_pages: 1 }
      : []
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/cards', component: SceneListPage }]
  })
  await router.push('/cards')
  const wrapper = mount(
    { components: { SceneListPage }, template: '<KeepAlive><SceneListPage/></KeepAlive>' },
    { global: { plugins: [router], stubs: { ElDialog: true } } }
  )
  await flushPromises()
  const thumbnail = wrapper.get('img.thumbnail')
  expect(thumbnail.attributes('src')).toBe('/api/admin/v1/media/published-thumb?thumbnail=list')
  expect(wrapper.get('tbody').text()).not.toContain('暂无场景图')
  expect(thumbnail.attributes('loading')).toBe('lazy')
  expect(
    wrapper.findAll('img').some((image) => image.attributes('src')?.includes('original'))
  ).toBe(false)
  await thumbnail.trigger('error')
  expect(wrapper.find('img.thumbnail').exists()).toBe(false)
  expect(wrapper.get('.thumbnail-placeholder').text()).toContain('加载失败')
  await wrapper.get('.thumbnail-retry').trigger('click')
  expect(wrapper.get('img.thumbnail').attributes('src')).toBe(
    '/api/admin/v1/media/published-thumb?thumbnail=list&retry=1'
  )
  expect(wrapper.find('.thumbnail-retry').exists()).toBe(false)
  wrapper.unmount()
})

it('draws a real client thumbnail when the server thumbnail is absent and keeps the original viewer separate', async () => {
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/jpeg;base64,generated-thumbnail'
  )
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 1200
      naturalHeight = 1800
      crossOrigin = ''
      onload: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
  const card = {
    id: 'missing-thumbnail-card',
    display_name: '无缩略图',
    display_title_en: 'Missing thumbnail',
    status: 'published',
    draft_revision: 1,
    current_version_id: 'v1',
    display_thumbnail_id: null,
    display_image_id: 'fallback-original',
    content: { name: '无缩略图', image_id: 'fallback-original' },
    issues: [],
    updated_at: ''
  }
  request.mockImplementation(async (path: string) =>
    path.startsWith('/api/admin/v1/cards?')
      ? {
          items: path.includes('page=2') ? [] : [card],
          total: 11,
          page: path.includes('page=2') ? 2 : 1,
          limit: 10,
          total_pages: 2
        }
      : path === '/api/admin/v1/cards/missing-thumbnail-card'
        ? card
        : []
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cards', component: SceneListPage },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } }
    ]
  })
  await router.push('/cards')
  const wrapper = mount(
    {
      template:
        '<RouterView v-slot="{Component}"><KeepAlive><component :is="Component"/></KeepAlive></RouterView>'
    },
    {
      global: { plugins: [router], stubs: { ElDialog: { template: '<section><slot/></section>' } } }
    }
  )
  await flushPromises()
  expect(wrapper.get('img.thumbnail').attributes('src')).toBe(
    'data:image/jpeg;base64,generated-thumbnail'
  )
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 144, 216)
  await wrapper.get('[aria-label="查看 无缩略图 场景大图"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('.image-viewport img').attributes('src')).toBe(
    '/api/admin/v1/media/fallback-original'
  )
  await router.push('/cards?page=2')
  await flushPromises()
  expect(wrapper.find('img.thumbnail').exists()).toBe(false)
  clearClientThumbnails()
  await router.push('/cards?page=1')
  await flushPromises()
  expect(drawImage).toHaveBeenCalledTimes(2)
  wrapper.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each([false, true])(
  'refreshes an unchanged offline card only after Worker success (dialog closed: %s)',
  async (closeEarly) => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    let accepted = false,
      finished = false
    const content = {
      name: '重新上架',
      title_en: 'Republish',
      image_id: null,
      audio_id: null,
      dialogue: [],
      vocabulary: [],
      chunks: []
    }
    const card = () => ({
      id: 'offline-card',
      display_name: '重新上架',
      display_title_en: 'Republish',
      status: finished ? 'published' : 'offline',
      draft_revision: 3,
      current_version_id: 'existing-version',
      has_unpublished_changes: false,
      content,
      issues: [],
      updated_at: '2026-10-23T11:00:00Z'
    })
    const batch = () => ({
      id: 'republish',
      created_at: '2026-10-23T12:00:00Z',
      items: [
        {
          id: 'publication-item',
          card_id: 'offline-card',
          name: '重新上架',
          title_en: 'Republish',
          state: finished ? 'succeeded' : 'queued',
          job_id: 'worker',
          error_code: null
        }
      ]
    })
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path.startsWith('/api/admin/v1/cards?'))
        return { items: [card()], total: 1, page: 1, limit: 10, total_pages: 1 }
      if (path === '/api/admin/v1/cards/offline-card') return card()
      if (path.endsWith('/preview'))
        return {
          preview_id: 'offline-preview',
          revision: 3,
          content,
          mode: 'draft',
          expires_at: '2026-10-23T13:00:00Z'
        }
      if (path === '/api/admin/v1/publication-batches' && options?.method === 'POST') {
        accepted = true
        return batch()
      }
      if (path === '/api/admin/v1/publication-batches') return accepted ? [batch()] : []
      if (path === '/api/admin/v1/publication-batches/republish') return batch()
      return []
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cards', component: SceneListPage }]
    })
    await router.push('/cards')
    const wrapper = mount(
      {
        template:
          '<RouterView v-slot="{ Component }"><KeepAlive><component :is="Component"/></KeepAlive></RouterView>'
      },
      {
        global: {
          plugins: [router],
          stubs: {
            ElDialog: {
              props: ['modelValue'],
              template: '<section v-if="modelValue"><slot/><slot name="footer"/></section>'
            }
          }
        }
      }
    )
    try {
      await flushPromises()
      await wrapper.get('input[aria-label="选择本页卡片"]').setValue(true)
      await wrapper
        .findAll('button')
        .find((button) => button.text() === '批量发布')!
        .trigger('click')
      await flushPromises()
      expect(request).toHaveBeenCalledWith('/api/admin/v1/cards/offline-card/preview', {
        method: 'POST',
        body: { revision: 3 }
      })
      expect(wrapper.text()).toContain('可发布 1 张')
      await wrapper.get('[data-action="confirm-reviewed"]').setValue(true)
      await wrapper.get('[data-action="publish-reviewed"]').trigger('click')
      await flushPromises()
      expect(request).toHaveBeenCalledWith('/api/admin/v1/publication-batches', {
        method: 'POST',
        key: expect.any(String),
        body: {
          confirmed: true,
          items: [{ card_id: 'offline-card', revision: 3, preview_id: 'offline-preview' }]
        }
      })
      expect(wrapper.get('.result-totals').text()).toContain('成功 0 张')
      expect(wrapper.get('.result-totals').text()).toContain('处理中 1 张')
      if (closeEarly) {
        await wrapper
          .findAll('button')
          .find((button) => button.text() === '关闭结果')!
          .trigger('click')
        await flushPromises()
      }
      finished = true
      await vi.advanceTimersByTimeAsync(closeEarly ? 5100 : 1100)
      await flushPromises()
      expect(wrapper.get('tbody').text()).toContain('已发布')
      if (!closeEarly) expect(wrapper.get('.result-totals').text()).toContain('成功 1 张')
    } finally {
      wrapper.unmount()
      vi.clearAllTimers()
    }
  }
)

it('ignores a delayed publication history response from a previous activation', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  let finishOld: (value: unknown) => void = () => {},
    historyReads = 0
  const success = {
    id: 'historical-batch',
    created_at: '2026-10-23T00:00:00Z',
    items: [
      {
        id: 'item',
        card_id: 'one',
        name: '真实完成',
        title_en: '',
        state: 'succeeded',
        job_id: 'worker',
        error_code: null
      }
    ]
  }
  request.mockImplementation((path: string) => {
    if (path.startsWith('/api/admin/v1/cards?'))
      return Promise.resolve({ items: [], total: 0, page: 1, limit: 10, total_pages: 0 })
    if (path === '/api/admin/v1/publication-batches') {
      if (historyReads++ === 0)
        return new Promise((resolve) => {
          finishOld = resolve
        })
      return Promise.resolve([success])
    }
    return Promise.resolve([])
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cards', component: SceneListPage },
      { path: '/:pathMatch(.*)*', component: { template: '<div>其他页面</div>' } }
    ]
  })
  await router.push('/cards')
  const wrapper = mount(
    {
      template:
        '<RouterView v-slot="{ Component }"><KeepAlive><component :is="Component"/></KeepAlive></RouterView>'
    },
    {
      global: { plugins: [router], stubs: { ElDialog: true } }
    }
  )
  try {
    await flushPromises()
    await router.push('/elsewhere')
    await router.push('/cards')
    await flushPromises()
    expect(wrapper.get('.batch-history').text()).toContain('成功 1')
    finishOld([{ ...success, items: [{ ...success.items[0], state: 'queued' }] }])
    await flushPromises()
    expect(wrapper.get('.batch-history').text()).toContain('成功 1')
    expect(wrapper.get('.batch-history').text()).toContain('处理中 0')
  } finally {
    wrapper.unmount()
    scroll.mockRestore()
  }
})
