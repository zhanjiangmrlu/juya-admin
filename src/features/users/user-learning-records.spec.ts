import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const { request, listeningRequest } = vi.hoisted(() => ({
  request: vi.fn(),
  listeningRequest: vi.fn()
}))
vi.mock('@/services/http-client', () => ({ api: { request } }))
vi.mock('@/services/listening-service', () => ({ listeningRequest }))
import UserLearningRecords from './user-learning-records.vue'

it('opens a listening checkin source through the published read-only route', async () => {
  request.mockImplementation(async (path: string) =>
    path.includes('/checkins?')
      ? { items: [{ date: '2026-10-27', card_count: 0, article_count: 1 }], total: 1 }
      : { items: [], total: 0 }
  )
  listeningRequest.mockResolvedValue({
    article_items: [
      {
        id: 'article',
        title_zh: '发布内容',
        title_en: 'Published',
        available: true,
        completed_at: '2026-10-27T01:00:00Z'
      }
    ],
    article_count: 1
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: UserLearningRecords },
      { path: '/listening/:id/published-preview', component: { template: '<div />' } }
    ]
  })
  await router.push('/')
  const page = mount(UserLearningRecords, {
    props: { userId: 'learner' },
    global: { plugins: [router] }
  })
  await flushPromises()
  await page
    .findAll('.tabs button')
    .find((button) => button.text().includes('打卡记录'))!
    .trigger('click')
  await flushPromises()
  await page.get('.checkin-heading').trigger('click')
  await flushPromises()
  expect(page.get('.day-card a').text()).toBe('查看发布内容')
  expect(page.get('.day-card a').attributes('href')).toBe('/listening/article/published-preview')
  expect(listeningRequest.mock.calls).toEqual([['/users/learner/checkins/2026-10-27']])
  page.unmount()
})
