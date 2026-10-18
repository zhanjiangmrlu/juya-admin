import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
import SceneListPage from './scene-list-page.vue'

afterEach(() => {
  vi.useRealTimers()
  sessionStorage.clear()
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
