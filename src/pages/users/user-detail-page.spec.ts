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
  await page
    .findAll('button')
    .find((button) => button.text() === '查看记录卡片')!
    .trigger('click')
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

it('shows the audited administrator and before/after authorization values in the detail history', async () => {
  network.mockReset().mockImplementation(async (request: Request) =>
    Response.json(
      new URL(request.url).pathname.endsWith('/history')
        ? {
            items: [
              {
                id: 'audit',
                admin_id: 'operator-42',
                action: 'renew',
                occurred_at: '2026-10-27T01:41:00Z',
                before: { status: 'active', expires_on: '2026-11-27' },
                after: { status: 'active', expires_on: '2026-12-27' }
              }
            ],
            total: 1,
            page: 1,
            limit: 10
          }
        : {
            id: 'learner',
            user_code: 'JY0001',
            nickname: '学习者',
            statistics: {},
            authorization: {
              status: 'active',
              starts_on: '2026-10-27',
              expires_on: '2026-11-27',
              expires_at: '2026-11-27T16:00:00Z',
              revision: 1
            }
          }
    )
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/users/:id', component: UserDetailPage }]
  })
  await router.push('/users/learner')
  const page = mount(UserDetailPage, {
    global: { plugins: [router], stubs: { UserLearningRecords: true, UserAuthorization: true } }
  })
  await flushPromises()
  expect(page.text()).toContain('最近授权操作')
  const audit = page.get('.authorization-history tbody').text()
  expect(audit).toContain('operator-42')
  expect(audit).toContain('2026-11-27')
  expect(audit).toContain('2026-12-27')
  expect(network.mock.calls.every(([request]) => request.method === 'GET')).toBe(true)
  page.unmount()
})
