import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', () => ({ api: { request } }))
import UserDetailPage from './user-detail-page.vue'
import UserListPage from './user-list-page.vue'
enableAutoUnmount(afterEach)

const user = {
  id: 'user-one',
  user_code: 'Juya001',
  nickname: 'Readonly',
  registered_at: '2026-10-22T01:00:00Z',
  statistics: {
    completed_cards: 0,
    current_streak: 0,
    total_checkin_days: 0,
    checked_in_today: false
  }
}
const rows = { items: [user], total: 40, page: 2, limit: 20, statistical_date: '2026-10-22' }
const target = '/users?search=Readonly&registered=today&checkin=unchecked&page=2&from=statistics'
let scroll = 0

/** 挂载真实用户列表与详情，使用与应用一致的缓存容器
 * @returns 用户组件容器和路由
 */
const open = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/users', component: UserListPage },
      { path: '/users/:id', component: UserDetailPage },
      { path: '/statistics', component: { template: '<p>数据统计</p>' } }
    ]
  })
  await router.push(target)
  const page = mount(
    {
      template:
        '<RouterView v-slot="{ Component }"><KeepAlive include="UserListPage"><component :is="Component" /></KeepAlive></RouterView>'
    },
    {
      global: { plugins: [router], stubs: { UserLearningRecords: true, ElDialog: true } }
    }
  )
  await flushPromises()
  return { router, page }
}

beforeEach(() => {
  scroll = 0
  request.mockReset().mockImplementation(async (path: string) =>
    path.includes('/users?')
      ? {
          ...rows,
          page: Number(new URL(path, 'https://example.test').searchParams.get('page') || 1)
        }
      : user
  )
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scroll)
  vi.spyOn(window, 'scrollTo').mockImplementation((...args: unknown[]) => {
    scroll = (args[0] as ScrollToOptions).top || 0
  })
})
afterEach(() => vi.restoreAllMocks())

it('shows the stable user code while navigation and detail requests retain UUIDs', async () => {
  const { page } = await open()
  expect(page.get('.identifier').text()).toBe('Juya001')
  await page.get('tbody a').trigger('click')
  await flushPromises()
  expect(page.get('.profile-fields').text()).toContain('Juya001')
  expect(request.mock.calls.some(([path]) => path === '/api/admin/v1/users/user-one')).toBe(true)
  page.unmount()
})

it.each(['explicit', 'history'])(
  'restores search, both filters, page and scroll on %s return',
  async (back) => {
    const { page, router } = await open()
    scroll = 650
    await page.get('tbody a').trigger('click')
    await flushPromises()
    scroll = 0
    if (back === 'explicit') await page.get('.button-link').trigger('click')
    else router.back()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(target)
    expect(scroll).toBe(650)
    expect(page.get('input').element.value).toBe('Readonly')
    expect(page.text()).toContain('返回数据统计')
    const query = new URL(request.mock.calls.at(-1)![0], 'https://example.test').searchParams
    expect([query.get('registered'), query.get('checkin'), query.get('page')]).toEqual([
      'today',
      'unchecked',
      '2'
    ])
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.query.page).toBe('1')
    expect(scroll).toBe(0)
    page.unmount()
  }
)

it('never scrolls the next detail when a returning list response arrives late', async () => {
  const { page, router } = await open()
  scroll = 650
  await page.get('tbody a').trigger('click')
  await flushPromises()
  let finish!: (value: unknown) => void
  request.mockImplementation((path: string) =>
    path.includes('/users?')
      ? new Promise((resolve) => {
          finish = resolve
        })
      : Promise.resolve(user)
  )
  await page.get('.button-link').trigger('click')
  await flushPromises()
  await router.push('/users/user-one')
  await flushPromises()
  scroll = 0
  vi.mocked(window.scrollTo).mockClear()
  finish(rows)
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/users/user-one')
  expect(window.scrollTo).not.toHaveBeenCalled()
  page.unmount()
})

it('uses the server fallback page after the current filter no longer has a second page', async () => {
  request.mockImplementation(async (path: string) =>
    path.includes('/users?') ? { ...rows, total: 20, page: 1 } : user
  )
  const { router, page } = await open()
  await flushPromises()
  expect(router.currentRoute.value.query.page).toBe('1')
  expect(router.currentRoute.value.query.registered).toBe('today')
  expect(router.currentRoute.value.query.checkin).toBe('unchecked')
  expect(page.text()).toContain('共 20 位用户')
  page.unmount()
})
