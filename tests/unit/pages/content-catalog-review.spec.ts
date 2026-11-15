import { flushPromises, mount } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import { emptyPayload, publishErrors } from '@/features/listening/listening-model'
import ListeningListPage from '@/pages/listening/listening-list-page.vue'
import SceneListPage from '@/pages/scenes/scene-list-page.vue'
import { useAdminStore } from '@/stores/admin-store'
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})
for (const path of ['/cards', '/listening']) {
  it.each(['503', 'cancelled'])(
    path + ' preserves cross-page free selection after confirmed %s filter navigation',
    async (failure) => {
      const isScene = path === '/cards'
      network.mockImplementation(async (request: Request) => {
        const url = new URL(request.url),
          pathname = url.pathname
        if (pathname.endsWith('/cards') || pathname.endsWith('/articles')) {
          if (failure === '503' && (url.searchParams.get('search') || url.searchParams.get('q')))
            return Response.json(
              { error: { code: 'temporarily_unavailable', message: '组合快照失败' } },
              { status: 503 }
            )
          const current = Number(url.searchParams.get('page') || 1)
          const item = isScene
            ? {
                id: String(current),
                display_name: `场景${current}`,
                display_title_en: 'Scene',
                status: 'published',
                current_version_id: 'v',
                draft_revision: 1,
                content_type: 'illustrated',
                published_content_type: 'illustrated',
                draft_content_type: 'illustrated',
                content: {
                  name: `场景${current}`,
                  title_en: 'Scene',
                  dialogue: [],
                  vocabulary: [],
                  chunks: []
                },
                issues: [],
                is_free: false,
                free_revision: 1,
                updated_at: ''
              }
            : {
                id: String(current),
                category_id: 'c',
                published_category_id: 'c',
                draft_category_id: 'c',
                status: 'published',
                revision: 1,
                payload: { ...emptyPayload(), title_zh: `文章${current}`, title_en: 'Article' },
                is_free: false,
                free_revision: 1,
                has_unpublished_changes: false,
                word_count: 1,
                created_at: ''
              }
          return Response.json({
            items: [item],
            total: 20,
            page: current,
            limit: 10,
            total_pages: 2,
            statistics: { total: 1, published: 1, free: 0, remaining: 1 }
          })
        }
        if (pathname.endsWith('/categories'))
          return Response.json({ items: [{ id: 'c', name: '分类', revision: 1, sort_order: 1 }] })
        if (pathname.endsWith('/free-policy'))
          return Response.json({ article_ids: [], revision: 1 })
        return Response.json([])
      })
      vi.spyOn(ElMessageBox, 'confirm').mockImplementation(vi.fn().mockResolvedValue('confirm'))
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path, component: isScene ? SceneListPage : ListeningListPage }]
      })
      await router.push(path)
      router.beforeResolve((to) =>
        failure === 'cancelled' && !!(to.query.search || to.query.q) ? false : undefined
      )
      const pinia = createPinia()
      useAdminStore(pinia).identity = { id: 'admin-first', username: 'admin-first' }
      const wrapper = mount(
        {
          template:
            '<RouterView v-slot="{ Component }"><KeepAlive><component :is="Component" /></KeepAlive></RouterView>'
        },
        { global: { plugins: [pinia, router], stubs: { ElDialog: true } } }
      )
      try {
        await flushPromises()
        await wrapper
          .findAll('button')
          .find((x) => x.text() === '批量设置免费')!
          .trigger('click')
        await wrapper.get('tbody input[type=checkbox]').setValue(true)
        expect(wrapper.get('.free-selection-bar').text()).toContain('已选1')
        await router.push({ query: { page: 2 } })
        await flushPromises()
        await wrapper.get('tbody input[type=checkbox]').setValue(true)
        expect(wrapper.get('.free-selection-bar').text()).toContain('跨2页')
        const result = await router.push({
          query: isScene ? { search: 'changed' } : { q: 'changed' }
        })
        await flushPromises()
        expect(result).toBeTruthy()
        expect(router.currentRoute.value.fullPath).toBe(`${path}?page=2`)
        expect(wrapper.get('.free-selection-bar').text()).toContain('已选2')
        expect(wrapper.get('.free-selection-bar').text()).toContain('跨2页')
        wrapper.getComponent({ name: 'FreeAccessControl' }).vm.$emit('changed')
        await flushPromises()
        expect(wrapper.get('.free-selection-bar').text()).toContain('跨2页')
        expect(router.currentRoute.value.fullPath).toBe(`${path}?page=2`)
        await router.push({ query: { page: 1 } })
        await flushPromises()
        expect(wrapper.get('tbody input[type=checkbox]').element).toHaveProperty('checked', true)
        expect(wrapper.get('.free-selection-bar').text()).toContain('已选2')
      } finally {
        wrapper.unmount()
      }
    }
  )
}
it('accepts the server original quote with trailing quotation mark', () => {
  const body = 'She bought tea!”'
  const word = {
    id: 'w',
    english: 'buy',
    meaning: '买',
    phonetic: '',
    source_hint: '',
    source: {
      start: 0,
      end: body.length,
      quote: body,
      word_start: 4,
      word_end: 10,
      word: 'bought',
      confirmed: true
    }
  }
  const payload = {
    ...emptyPayload(),
    title_zh: '标题',
    title_en: 'Title',
    body_en: body,
    translation_zh: '她买了茶',
    audio_id: 'audio',
    expressions: Array.from({ length: 5 }, () => ({
      english: 'phrase',
      chinese: '表达',
      example: 'Example.'
    })),
    vocabulary: [word]
  }
  expect(publishErrors(payload, 'category')).toEqual([])
})

it('rejects stale fallback data after a newer category navigation', async () => {
  let releaseOld!: (value: Response) => void
  const item = (id: string) => ({
    id,
    category_id: 'c',
    status: 'published',
    revision: 1,
    payload: { ...emptyPayload(), title_zh: id, title_en: id },
    is_free: false,
    free_revision: 1,
    has_unpublished_changes: false,
    word_count: 1,
    created_at: ''
  })
  const listing = (id: string, page: number) => ({
    items: [item(id)],
    total: 20,
    page,
    limit: 10,
    total_pages: 2,
    statistics: { total: id === 'NEW' ? 22 : 20, published: 1, free: 0, remaining: 1 }
  })
  network.mockImplementation(async (request: Request) => {
    const url = new URL(request.url),
      path = url.pathname
    if (path.endsWith('/articles')) {
      if (url.searchParams.get('category_id') === 'new') return Response.json(listing('NEW', 1))
      if (url.searchParams.get('page') === '2')
        return new Promise<Response>((resolve) => {
          releaseOld = resolve
        })
      return Response.json(listing('OLD', 2))
    }
    if (path.endsWith('/categories'))
      return Response.json({
        items: [
          { id: 'c', name: '旧分类', revision: 1, sort_order: 1 },
          { id: 'new', name: '新分类', revision: 1, sort_order: 2 }
        ]
      })
    if (path.endsWith('/free-policy')) return Response.json({ article_ids: [], revision: 1 })
    return Response.json([])
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/listening', component: ListeningListPage }]
  })
  await router.push('/listening?page=3')
  const wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [createPinia(), router], stubs: { ElDialog: true } } }
  )
  try {
    await flushPromises()
    expect(releaseOld).toBeTypeOf('function')
    await router.push({ query: { category_id: 'new' } })
    await flushPromises()
    expect(wrapper.get('tbody').text()).toContain('NEW')
    expect(wrapper.get('[aria-label="分类统计"]').text()).toContain('22')
    releaseOld(Response.json(listing('OLD', 2)))
    await flushPromises()
    expect(router.currentRoute.value.query.category_id).toBe('new')
    expect(wrapper.get('tbody').text()).toContain('NEW')
    expect(wrapper.get('[aria-label="分类统计"]').text()).toContain('22')
  } finally {
    wrapper.unmount()
  }
})
