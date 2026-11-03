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
    props: { userId: 'user', userCode: 'Juya001', authorization },
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
  expect(page.text()).toContain('用户编号：Juya001')
  expect(request.mock.calls).toHaveLength(1)
  expect(request.mock.calls[0][1].body.action).toBe('renew')
  page.unmount()
})

it('previews a date as YYYY-MM-DD and normalizes the cleared picker to an empty string', async () => {
  request.mockReset().mockRejectedValue(new Error('请核对到期日期'))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: UserAuthorization }]
  })
  await router.push('/')
  const page = mount(UserAuthorization, {
    props: {
      userId: 'user',
      userCode: 'Juya001',
      authorization: {
        status: 'none',
        starts_on: null,
        expires_on: null,
        expires_at: null,
        revision: 1
      }
    },
    global: { plugins: [router], stubs: { ElDialog: true } }
  })
  await page
    .findAll('button')
    .find((button) => button.text() === '指定到期日')!
    .trigger('click')
  const date = page.get('input[aria-label="授权到期日期"]')
  await date.setValue('2026-12-31')
  await date.trigger('change')
  await flushPromises()
  await page
    .findAll('button')
    .find((button) => button.text() === '核对日期')!
    .trigger('click')
  await flushPromises()
  expect(request.mock.calls.at(-1)?.[1].body).toEqual({
    action: 'set_expiry',
    expires_on: '2026-12-31'
  })
  await page.get('.el-date-editor').trigger('mouseenter')
  await page.get('.clear-icon').trigger('click')
  await page
    .findAll('button')
    .find((button) => button.text() === '核对日期')!
    .trigger('click')
  await flushPromises()
  expect(request.mock.calls.at(-1)?.[1].body).toEqual({ action: 'set_expiry', expires_on: '' })
  expect(request.mock.calls.every(([path]) => path.endsWith('/preview'))).toBe(true)
  page.unmount()
})
