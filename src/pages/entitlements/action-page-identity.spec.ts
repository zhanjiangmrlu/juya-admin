import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ConfirmDialog from '@/components/confirm-dialog/confirm-dialog.vue'
import { useAuthStore } from '@/features/auth/auth-store'

import FormalActionPage from './formal-action-page.vue'
import LimitedActionPage from './limited-action-page.vue'

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' }
  })
}

function detail(id: string) {
  return {
    id,
    user_id: `USER-${id}`,
    package_id: `PACKAGE-${id}`,
    package_name: `内容包 ${id}`,
    campaign_version_id: `VERSION-${id}`,
    campaign_id: `CAMPAIGN-${id}`,
    campaign_name: `活动 ${id}`,
    status: 'ACTIVE',
    term: 'MONTH_3',
    granted_at: '2026-09-29T00:00:00Z',
    start_deadline: '2026-10-06T00:00:00Z',
    activated_at: '2026-09-29T00:00:00Z',
    expires_at: '2026-10-02T00:00:00Z',
    remedy_count: 0,
    version: 1,
    duration_days: 3,
    activation_window_days: 7,
    scene_ids: [],
    available_operations: ['PAUSE', 'REVOKE']
  }
}

async function setup(kind: 'formal' | 'limited') {
  const component = kind === 'formal' ? FormalActionPage : LimitedActionPage
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().csrfToken = 'csrf-test'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/action/:id', component },
      { path: '/entitlements', name: 'entitlements', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } }
    ]
  })
  await router.push('/action/A')
  const wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [pinia, router, ElementPlus] } }
  )
  return { wrapper, router }
}

describe.each(['formal', 'limited'] as const)('%s action object identity', (kind) => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not request a missing object when leaving the action route', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(url)
        return Promise.resolve(json(detail('A')))
      })
    )
    const { wrapper, router } = await setup(kind)
    await flushPromises()
    await router.push('/entitlements')
    await flushPromises()
    expect(urls).toEqual([`/api/v1/admin/${kind}-entitlements/A`])
    wrapper.unmount()
  })

  it.each(['A-first', 'B-first'])(
    'keeps B and submits only B when details resolve %s',
    async (order) => {
      const pending = new Map<string, (response: Response) => void>()
      const commands: { url: string; body: unknown }[] = []
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init: RequestInit) => {
          if (init.method === 'POST') {
            if (url.includes('/commands/')) {
              commands.push({ url, body: JSON.parse(String(init.body)) })
              return Promise.reject(new TypeError('response lost'))
            }
            return Promise.resolve(json(detail('B')))
          }
          return new Promise<Response>((resolve) => pending.set(url.slice(-1), resolve))
        })
      )
      const { wrapper, router } = await setup(kind)
      await router.push('/action/B')
      await flushPromises()
      const first = order === 'A-first' ? 'A' : 'B'
      pending.get(first)!(json(detail(first)))
      await flushPromises()
      expect(wrapper.text()).not.toContain('USER-A')
      if (first === 'A') expect(wrapper.find('.submit').exists()).toBe(false)
      const last = first === 'A' ? 'B' : 'A'
      pending.get(last)!(json(detail(last)))
      await flushPromises()
      expect(wrapper.text()).toContain('USER-B')
      expect(wrapper.text()).not.toContain('USER-A')
      if (kind === 'formal') await wrapper.find('form').trigger('submit')
      else await wrapper.find('.submit').trigger('click')
      await flushPromises()
      wrapper.findComponent(ConfirmDialog).vm.$emit('confirm', '核对操作')
      await flushPromises()
      expect(commands).toHaveLength(1)
      if (kind === 'formal')
        expect(commands[0]?.body).toMatchObject({ user_id: 'USER-B', package_id: 'PACKAGE-B' })
      else expect(commands[0]?.url).toContain('/limited-entitlements/B/commands/pause')
      wrapper.unmount()
    }
  )

  it('invalidates detail and confirmation and blocks submission while B is loading', async () => {
    let finishB!: (response: Response) => void
    const writes: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        if (url.endsWith('/B'))
          return new Promise<Response>((resolve) => {
            finishB = resolve
          })
        if (init.method === 'POST' && url.includes('/commands/')) {
          writes.push(url)
          return Promise.reject(new TypeError('response lost'))
        }
        return Promise.resolve(json(detail('A')))
      })
    )
    const { wrapper, router } = await setup(kind)
    await flushPromises()
    if (kind === 'formal') await wrapper.find('form').trigger('submit')
    else await wrapper.find('.submit').trigger('click')
    await flushPromises()
    const oldDialog = wrapper.findComponent(ConfirmDialog)
    expect(oldDialog.props('modelValue')).toBe(true)
    await router.push('/action/B')
    await flushPromises()
    oldDialog.vm.$emit('confirm', '旧对象确认')
    await flushPromises()
    expect(writes).toEqual([])
    expect(wrapper.text()).not.toContain('USER-A')
    expect(wrapper.findComponent(ConfirmDialog).exists()).toBe(false)
    finishB(json(detail('B')))
    await flushPromises()
    expect(wrapper.text()).toContain('USER-B')
    if (kind === 'formal') expect(wrapper.findComponent(ConfirmDialog).exists()).toBe(false)
    else expect(wrapper.findComponent(ConfirmDialog).props('modelValue')).toBe(false)
    wrapper.unmount()
  })
})

it('ignores an A preview that completes after B details have loaded', async () => {
  let finishPreview!: (response: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/preview-operation'))
        return new Promise<Response>((resolve) => {
          finishPreview = resolve
        })
      return Promise.resolve(json(detail(url.slice(-1))))
    })
  )
  const { wrapper, router } = await setup('formal')
  await flushPromises()
  await wrapper.find('form').trigger('submit')
  await router.push('/action/B')
  await flushPromises()
  finishPreview(json(detail('A')))
  await flushPromises()
  expect(wrapper.text()).toContain('USER-B')
  expect(wrapper.findComponent(ConfirmDialog).exists()).toBe(false)
  wrapper.unmount()
  vi.unstubAllGlobals()
})

describe('limited action retry identity', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps the exact retry key after network failure and same-object detail refresh', async () => {
    const commands: { url: string; body: unknown; key: string | null }[] = []
    let reads = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        if (init.method === 'POST') {
          commands.push({
            url,
            body: JSON.parse(String(init.body)),
            key: new Headers(init.headers).get('X-Idempotency-Key')
          })
          return Promise.reject(new TypeError('response lost'))
        }
        reads += 1
        return Promise.resolve(
          json({
            ...detail('A'),
            version: reads,
            campaign_name: reads === 1 ? '刷新前活动' : '刷新后活动',
            available_operations: reads === 1 ? ['PAUSE', 'REVOKE'] : ['REVOKE', 'PAUSE']
          })
        )
      })
    )
    const { wrapper } = await setup('limited')
    await flushPromises()
    await wrapper.find('.submit').trigger('click')
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm', '核对操作')
    await flushPromises()
    expect(commands).toHaveLength(1)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '刷新服务端信息')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('刷新后活动')
    expect(wrapper.text()).toContain('v2')
    await wrapper.find('.submit').trigger('click')
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm', '核对操作')
    await flushPromises()
    expect(commands).toHaveLength(2)
    expect(commands[0]?.key).toMatch(/^idem-/)
    expect(commands[1]).toEqual(commands[0])
    await wrapper.find('.submit').trigger('click')
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm', '新的操作原因')
    await flushPromises()
    expect(commands[2]?.body).toEqual({ reason: '新的操作原因' })
    expect(commands[2]?.key).not.toBe(commands[1]?.key)
    wrapper.unmount()
  })

  it('invalidates retry identity on route changes and ignores the old object refresh', async () => {
    const commands: { url: string; body: unknown; key: string | null }[] = []
    let finishRefresh!: (response: Response) => void
    let readsA = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        if (init.method === 'POST') {
          commands.push({
            url,
            body: JSON.parse(String(init.body)),
            key: new Headers(init.headers).get('X-Idempotency-Key')
          })
          return Promise.reject(new TypeError('response lost'))
        }
        if (url.endsWith('/A')) {
          readsA += 1
          if (readsA === 2)
            return new Promise<Response>((resolve) => {
              finishRefresh = resolve
            })
        }
        return Promise.resolve(json(detail(url.slice(-1))))
      })
    )
    const { wrapper, router } = await setup('limited')
    await flushPromises()
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm', '核对操作')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '刷新服务端信息')!
      .trigger('click')
    await router.push('/action/B')
    await flushPromises()
    expect(wrapper.text()).not.toContain('操作失败')
    finishRefresh(json({ ...detail('A'), version: 99 }))
    await flushPromises()
    expect(wrapper.text()).toContain('USER-B')
    expect(wrapper.text()).not.toContain('USER-A')
    expect(wrapper.text()).not.toContain('v99')
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm', '核对操作')
    await flushPromises()
    expect(commands[1]?.url).toContain('/limited-entitlements/B/commands/pause')
    expect(commands[1]?.key).not.toBe(commands[0]?.key)
    await router.push('/action/A')
    await flushPromises()
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm', '核对操作')
    await flushPromises()
    expect(commands).toHaveLength(3)
    expect(commands[2]?.url).toBe(commands[0]?.url)
    expect(commands[2]?.body).toEqual(commands[0]?.body)
    expect(commands[2]?.key).not.toBe(commands[0]?.key)
    wrapper.unmount()
  })
})
