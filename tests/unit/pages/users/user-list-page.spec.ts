import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', () => ({ api: { request } }))
import UserDetailPage from '@/pages/users/user-detail-page.vue'
import UserListPage from '@/pages/users/user-list-page.vue'
enableAutoUnmount(afterEach)

const user = {
  id: 'user-one',
  user_code: 'Juya001',
  nickname: 'Readonly',
  phone: '13800000000',
  wechat_contact: 'legacy-contact',
  phone_source: 'user_entered_unverified',
  wechat_source: 'user_entered_unverified',
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

it('changes the visible list page while retaining filters, source and the fixed page size', async () => {
  const { page, router } = await open()
  await page
    .findAll('button')
    .find((button) => button.text() === '上一页')!
    .trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toMatchObject({
    search: 'Readonly',
    registered: 'today',
    checkin: 'unchecked',
    page: '1',
    from: 'statistics'
  })
  const query = new URL(request.mock.calls.at(-1)![0], 'https://example.test').searchParams
  expect(query.get('limit')).toBe('20')
  expect(query.get('page')).toBe('1')
  page.unmount()
})

it.each([0, 5, 20])(
  'keeps pagination visible and both directions disabled for %i users',
  async (total) => {
    request.mockImplementation(async (path: string) =>
      path.includes('/users?') ? { ...rows, items: total ? [user] : [], total, page: 1 } : user
    )
    const { page } = await open()
    await flushPromises()
    expect(page.get('.user-pagination').text()).toContain(
      `${total ? '共' : '匹配'} ${total} 位用户`
    )
    expect(page.find('.user-pagination .el-pagination').exists()).toBe(true)
    expect(page.get('.user-pagination .btn-prev').attributes('disabled')).toBeDefined()
    expect(page.get('.user-pagination .btn-next').attributes('disabled')).toBeDefined()
    page.unmount()
  }
)

it('does not expose legacy contact values while stable identity and learning data remain available', async () => {
  const { page } = await open()
  expect(page.get('input').attributes('placeholder')).toBe('搜索用户编号或昵称')
  expect(page.get('thead').text()).not.toContain('联系方式')
  expect(page.text()).not.toContain('13800000000')
  expect(page.text()).not.toContain('legacy-contact')
  expect(page.text()).not.toContain('联系方式与来源')
  expect(page.get('tbody').text()).toContain('Juya001')
  expect(page.get('thead').text()).toContain('已学场景')
  expect(page.get('thead').text()).toContain('学习授权')
})

it('keeps the empty table and active filters available and clears them back to the first page', async () => {
  request.mockImplementation(async (path: string) => {
    if (!path.includes('/users?')) return user
    const query = new URL(path, 'https://example.test').searchParams
    return query.get('search') ? { ...rows, items: [], total: 0, page: 1 } : { ...rows, page: 1 }
  })
  const { page, router } = await open()
  expect(page.get('input').element.value).toBe('Readonly')
  expect(page.get('.users-table thead').text()).toContain('用户')
  expect(page.get('.users-table thead').text()).toContain('学习授权')
  expect(page.get('.users-table').text()).toContain('没有符合条件的用户')
  expect(page.get('.users-table').text()).toContain('试试其他用户编号或昵称，或清空筛选后查看。')
  expect(page.get('.user-pagination').text()).toContain('匹配 0 位用户')
  expect(router.currentRoute.value.query.registered).toBe('today')
  expect(router.currentRoute.value.query.checkin).toBe('unchecked')
  expect(router.currentRoute.value.query.page).toBe('1')
  await page
    .findAll('button')
    .find((button) => button.text() === '清空筛选')!
    .trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toMatchObject({
    search: '',
    registered: 'all',
    checkin: 'all',
    authorization_status: 'all',
    page: '1',
    from: 'statistics'
  })
  expect(page.get('input').element.value).toBe('')
  expect(page.get('tbody').text()).toContain('Juya001')
  expect(page.text()).not.toContain('没有符合条件的用户')
})
