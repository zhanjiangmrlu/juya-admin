import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import UserDetailPage from './user-detail-page.vue'

it('uses the published version for vocabulary audition from a user record without learner writes', async () => {
  network.mockResolvedValueOnce(
    Response.json({
      id: 'learner',
      nickname: '学习者',
      statistics: { date: '2026-10-17' }
    })
  )
  network.mockResolvedValueOnce(
    Response.json({
      card_id: 'card',
      version_id: 'published-version',
      content: {},
      mode: 'published'
    })
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/users/:id', component: UserDetailPage },
      { path: '/users', component: { template: '<div />' } }
    ]
  })
  await router.push('/users/learner')
  const page = mount(UserDetailPage, {
    global: {
      plugins: [router],
      stubs: {
        UserLearningRecords: {
          template: "<button @click=\"$emit('preview', 'card')\">查看记录卡片</button>"
        },
        ScenePreview: {
          name: 'ScenePreview',
          props: ['content', 'mode', 'pronunciation'],
          template: '<div />'
        }
      }
    }
  })
  await flushPromises()
  await page.get('section + section + button').trigger('click')
  await flushPromises()
  expect(page.findComponent({ name: 'ScenePreview' }).props()).toMatchObject({
    mode: 'published',
    pronunciation: { cardId: 'card', reference: { version_id: 'published-version' } }
  })
  expect(network.mock.calls.map(([request]) => new URL(request.url).pathname)).toEqual([
    '/api/admin/v1/users/learner',
    '/api/admin/v1/cards/card/published'
  ])
  expect(network.mock.calls.every(([request]) => request.method === 'GET')).toBe(true)
  page.unmount()
})
