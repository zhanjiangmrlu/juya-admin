import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
import UserAuthorization from './user-authorization.vue'

it('never labels an in-flight renewal preview as revocation when another action is clicked', async () => {
  const authorization = {
    status: 'active' as const,
    starts_on: '2026-10-25',
    expires_on: '2026-11-25',
    expires_at: '2026-11-25T16:00:00Z',
    revision: 1
  }
  let finish!: (value: unknown) => void
  request.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: UserAuthorization }]
  })
  await router.push('/')
  const page = mount(UserAuthorization, {
    props: { userId: 'user', authorization },
    global: {
      plugins: [router],
      stubs: {
        ElDialog: {
          props: ['title'],
          template: '<div><h3>{{ title }}</h3><slot/><slot name="footer"/></div>'
        }
      }
    }
  })
  await page
    .findAll('button')
    .find((button) => button.text() === '续期一个月')!
    .trigger('click')
  await page
    .findAll('button')
    .find((button) => button.text() === '撤销授权')!
    .trigger('click')
  finish({
    user_id: 'user',
    before: authorization,
    after: { starts_on: '2026-10-25', expires_on: '2026-12-25', status: 'active' },
    preview_token: 'renewal-only'
  })
  await flushPromises()
  expect(page.get('h3').text()).toBe('续期一个月')
  expect(page.text()).toContain('最终到期日：2026-12-25')
  expect(request.mock.calls).toHaveLength(1)
  expect(request.mock.calls[0][1].body.action).toBe('renew')
  page.unmount()
})
