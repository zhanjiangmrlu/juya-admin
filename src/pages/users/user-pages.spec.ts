import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useAuthStore } from '@/features/auth/auth-store'

import UserDetailPage from './user-detail-page.vue'
import UserListPage from './user-list-page.vue'

const contact = {
  change_pending: true,
  contact_status: 'PENDING',
  updated_at: '2026-09-29T08:00:00Z',
  verified_at: null,
  verified_by: null,
  wechat_id: 'wx-complete-user'
}

const projection = {
  account_status: 'ACTIVE',
  contact,
  contact_degraded: false,
  formal_entitlement_count: 2,
  last_active_at: '2026-09-29T08:00:00Z',
  limited_entitlement_count: 1,
  open_feedback_count: 3,
  user_id: 'USER-1'
}

describe('user pages', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows full contacts, enables status filtering, and switches to correction rows', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.includes('/contact-corrections')
        ? {
            items: [
              {
                created_at: '2026-09-29T08:00:00Z',
                id: 'COR-1',
                juya_number: 'JY000000000001',
                nickname: '学习者',
                processed_at: null,
                reason: '申请重新修改微信号',
                status: 'PENDING',
                timeline: [],
                user_id: 'USER-1',
                wechat_id: 'wx-complete-user'
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }
        : [projection]
      return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    })
    vi.stubGlobal('fetch', fetchSpy)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { component: UserListPage, name: 'users', path: '/users' },
        { component: { template: '<div />' }, name: 'user-detail', path: '/users/:userId' },
        {
          component: { template: '<div />' },
          name: 'contact-correction',
          path: '/contacts/corrections/:id'
        }
      ]
    })
    await router.push('/users')
    await router.isReady()
    const wrapper = mount(UserListPage, {
      global: { plugins: [createPinia(), router, ElementPlus] }
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('wx-complete-user'))
    expect(wrapper.text()).not.toContain('联系资料列表接口待接入')
    expect(wrapper.find('[aria-label="联系状态筛选"]').exists()).toBe(true)

    const switchButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('更正申请'))
    await switchButton?.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('申请重新修改微信号'))
  })

  it('shows learning counts and copies only after the audit request succeeds', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 204 })
      return new Response(
        JSON.stringify({
          ...projection,
          favorite_count: 4,
          learning_days: 12,
          learning_degraded: false,
          open_scene_completed_count: 7
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    })
    const writeText = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().csrfToken = 'csrf-test'
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { component: UserDetailPage, name: 'user-detail', path: '/users/:userId' },
        { component: { template: '<div />' }, name: 'users', path: '/users' }
      ]
    })
    await router.push('/users/USER-1')
    await router.isReady()
    const wrapper = mount(UserDetailPage, {
      global: { plugins: [pinia, router, ElementPlus] }
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('wx-complete-user'))
    expect(wrapper.text()).toContain('开放场景完成数')
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('4')
    expect(wrapper.text()).not.toContain('开放场景、学习天数与收藏统计接口待接入')

    const copyButton = wrapper.findAll('button').find((button) => button.text() === '复制')
    await copyButton?.trigger('click')
    await flushPromises()

    const auditCallIndex = fetchSpy.mock.calls.findIndex(([input]) =>
      String(input).includes('/contact-copy-events')
    )
    expect(auditCallIndex).toBeGreaterThanOrEqual(0)
    expect(writeText).toHaveBeenCalledWith('wx-complete-user')
  })
})
