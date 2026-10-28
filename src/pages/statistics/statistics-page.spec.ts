import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import StatisticsPage from './statistics-page.vue'
enableAutoUnmount(afterEach)
beforeEach(() => network.mockReset())
afterEach(() => vi.restoreAllMocks())
const snapshot = {
  user_count: 8,
  new_users_today: 2,
  published_card_count: 3,
  statistical_date: '2026-10-21',
  updated_at: '2026-10-21T15:59:59Z'
}

it('separates current published listening articles from scene counts and links to listening management', async () => {
  network.mockResolvedValue(Response.json({ ...snapshot, published_article_count: 7 }))
  const { page } = await open()
  expect(page.get('[data-metric="articles"]').text()).toContain('7')
  expect(page.get('[data-metric="cards"]').text()).toContain('3')
  expect(page.text()).toContain('已发布听读文章')
})
/** 挂载统计页及三个真实指标的路由目标
 * @returns 统计组件和路由
 */
const open = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/statistics', component: StatisticsPage },
      { path: '/users', component: { template: '<p>用户</p>' } },
      { path: '/cards', component: { template: '<p>卡片</p>' } }
    ]
  })
  await router.push('/statistics?search=old&registered=today&checkin=checked&page=9')
  const page = mount(StatisticsPage, { global: { plugins: [router] } })
  await flushPromises()
  return { page, router }
}

it.each(['success', 'failure'])(
  'rechecks after a delayed previous-day %s response when foreground events arrive while busy',
  async (outcome) => {
    let finish!: (response: Response) => void
    network
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValueOnce(
        Response.json({ ...snapshot, statistical_date: '2026-10-22', new_users_today: 0 })
      )
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const { page } = await open()
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(network).toHaveBeenCalledTimes(1)
    finish(
      outcome === 'success'
        ? Response.json(snapshot)
        : Response.json({ error: { code: 'unavailable', message: '暂不可用' } }, { status: 503 })
    )
    await flushPromises()
    expect(network).toHaveBeenCalledTimes(2)
    expect(page.text()).toContain('2026-10-22')
    expect(page.findAll('.metric-value').map((item) => item.text())).toEqual(['8', '0', '3'])
    await flushPromises()
    expect(network).toHaveBeenCalledTimes(2)
    page.unmount()
  }
)

it('does not start a queued foreground request after leaving the statistics page', async () => {
  let finish!: (response: Response) => void
  network.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      })
  )
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const { page } = await open()
  window.dispatchEvent(new Event('focus'))
  page.unmount()
  finish(Response.json(snapshot))
  await flushPromises()
  expect(network).toHaveBeenCalledTimes(1)
})

it.each([
  ['users', '/users', { registered: 'all', checkin: 'all', from: 'statistics' }],
  ['new-users', '/users', { registered: 'today', checkin: 'all', from: 'statistics' }],
  ['cards', '/cards', { status: 'published', from: 'statistics' }]
] as const)(
  'keeps real zero %s clickable with fresh destination filters',
  async (metric, path, query) => {
    network.mockResolvedValue(
      Response.json({ ...snapshot, user_count: 0, new_users_today: 0, published_card_count: 0 })
    )
    const { page, router } = await open()
    expect(page.findAll('.metric-value').map((item) => item.text())).toEqual(['0', '0', '0'])
    expect(page.get(`[data-metric="${metric}"]`).attributes('disabled')).toBeUndefined()
    await page.get(`[data-metric="${metric}"]`).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(path)
    expect(router.currentRoute.value.query).toEqual(query)
    page.unmount()
  }
)

it('shows unavailable after a first 503 and retries without inventing zero', async () => {
  network
    .mockResolvedValueOnce(
      Response.json({ error: { code: 'unavailable', message: '暂不可用' } }, { status: 503 })
    )
    .mockResolvedValueOnce(Response.json(snapshot))
  const { page } = await open()
  expect(page.findAll('.metric-value')).toHaveLength(0)
  expect(page.findAll('.overview-metric:disabled')).toHaveLength(3)
  expect(page.text()).toContain('暂未获取')
  await page.get('[role=alert] button').trigger('click')
  await flushPromises()
  expect(page.findAll('.metric-value')).toHaveLength(3)
  page.unmount()
})

it('preserves the previous dated snapshot when a refresh returns 503', async () => {
  network
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockResolvedValueOnce(
      Response.json({ error: { code: 'unavailable', message: '暂不可用' } }, { status: 503 })
    )
  const { page } = await open()
  await page.get('.page-heading button').trigger('click')
  await flushPromises()
  expect(page.findAll('.metric-value').map((item) => item.text())).toEqual(['8', '2', '3'])
  expect(page.text()).toContain('暂未更新')
  expect(page.text()).toContain('2026-10-21')
  page.unmount()
})
it('keeps unknown metrics out of the UI and resets list filters when a metric is opened', async () => {
  let finish!: (response: Response) => void
  network.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      })
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/statistics', component: StatisticsPage },
      { path: '/users', component: { template: '<p>用户</p>' } }
    ]
  })
  await router.push('/statistics')
  const page = mount(StatisticsPage, { global: { plugins: [router] } })
  await page.vm.$nextTick()
  expect(page.find('[role="status"]').exists()).toBe(true)
  expect(page.text()).not.toContain('0 人')
  expect(page.findAll('.metric-value')).toHaveLength(0)
  finish(
    Response.json({
      user_count: 8,
      new_users_today: 2,
      published_card_count: 3,
      statistical_date: '2026-10-17',
      updated_at: '2026-10-17T03:00:00Z'
    })
  )
  await flushPromises()
  expect(page.text()).toContain('8')
  await page.get('[data-metric="new-users"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/users')
  expect(router.currentRoute.value.query).toMatchObject({
    registered: 'today',
    checkin: 'all',
    from: 'statistics'
  })
  expect(router.currentRoute.value.query.search).toBeUndefined()
  page.unmount()
})
