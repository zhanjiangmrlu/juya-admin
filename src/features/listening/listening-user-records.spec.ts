import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/services/listening-service', () => ({ listeningRequest: request }))
import ListeningUserRecords from './listening-user-records.vue'

it('opens available history as a read-only published preview and keeps unavailable records inert', async () => {
  request.mockResolvedValue({
    items: [
      { id: 'live', title_zh: '发布标题', title_en: 'Published', available: true },
      { id: 'gone', title_zh: '历史内容', title_en: 'Unavailable', available: false }
    ],
    total: 2,
    page: 1,
    limit: 20
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: ListeningUserRecords },
      { path: '/listening/:id/published-preview', component: { template: '<div />' } }
    ]
  })
  await router.push('/')
  const page = mount(ListeningUserRecords, {
    props: { userId: 'learner' },
    global: { plugins: [router] }
  })
  await flushPromises()
  expect(page.get('a').text()).toBe('查看发布内容')
  expect(page.get('a').attributes('href')).toBe('/listening/live/published-preview')
  expect(page.findAll('a')).toHaveLength(1)
  await page.get('a').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/listening/live/published-preview')
  expect(request.mock.calls).toEqual([['/users/learner/records?page=1&limit=20']])
  page.unmount()
})
