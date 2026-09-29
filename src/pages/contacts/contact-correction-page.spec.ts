import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useAuthStore } from '@/features/auth/auth-store'

import ContactCorrectionPage from './contact-correction-page.vue'

describe('contact correction page', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the real current contact and timeline without inventing a new WeChat field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              created_at: '2026-09-29T08:00:00Z',
              id: 'COR-1',
              juya_number: 'JY000000000001',
              nickname: '学习者',
              processed_at: null,
              reason: '申请重新获得一次修改机会',
              status: 'PENDING',
              timeline: [
                {
                  actor_id: 'USER-1',
                  actor_type: 'USER',
                  event_type: 'CONTACT_CORRECTION_CREATED',
                  occurred_at: '2026-09-29T08:00:00Z',
                  status: 'PENDING'
                }
              ],
              user_id: 'USER-1',
              wechat_id: 'wx-current-user'
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 }
          )
      )
    )
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().csrfToken = 'csrf-test'
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          component: ContactCorrectionPage,
          name: 'contact-correction',
          path: '/contacts/corrections/:id'
        },
        { component: { template: '<div />' }, name: 'users', path: '/users' }
      ]
    })
    await router.push('/contacts/corrections/COR-1')
    await router.isReady()
    const wrapper = mount(ContactCorrectionPage, {
      global: { plugins: [pinia, router, ElementPlus] }
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('wx-current-user'))
    expect(wrapper.text()).toContain('申请重新获得一次修改机会')
    expect(wrapper.text()).toContain('CONTACT_CORRECTION_CREATED')
    expect(wrapper.text()).not.toContain('新微信号')
    expect(wrapper.text()).not.toContain('接口待接入')
    const buttons = wrapper.findAll('button')
    expect(
      buttons.find((button) => button.text() === '批准并重置修改机会')?.attributes('disabled')
    ).toBeUndefined()
    expect(
      buttons.find((button) => button.text() === '拒绝')?.attributes('disabled')
    ).toBeUndefined()
  })
})
