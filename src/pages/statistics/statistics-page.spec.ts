import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import StatisticsPage from './statistics-page.vue'
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
})
