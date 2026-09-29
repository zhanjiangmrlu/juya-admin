import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import PlainTextContent from '@/components/plain-text-content/plain-text-content.vue'
import { useAuthStore } from '@/features/auth/auth-store'

import FeedbackDetailPage from './feedback-detail-page.vue'
import FeedbackListPage from './feedback-list-page.vue'
import FeedbackRespondPage from './feedback-respond-page.vue'

describe('feedback pages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders feedback HTML markers as plain text', () => {
    const wrapper = mount(PlainTextContent, {
      props: { content: '<img src=x onerror=alert(1)>' }
    })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
  })

  it('loads the paginated feedback list and renders descriptions as plain text', async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(
          JSON.stringify({
            items: [
              {
                category: 'CONTENT',
                created_at: '2026-09-29T08:00:00Z',
                deadline_at: '2026-09-30T08:00:00Z',
                description: '<img src=x onerror=alert(1)>',
                id: 'FB-1',
                sla_state: 'ON_TRACK',
                status: 'PROCESSING',
                supplement_rounds: 1,
                updated_at: '2026-09-29T09:00:00Z',
                user_id: 'USER-1'
              }
            ],
            page: 1,
            page_size: 20,
            total: 1
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        { component: FeedbackListPage, name: 'feedback', path: '/feedback' },
        { component: FeedbackDetailPage, name: 'feedback-detail', path: '/feedback/:id' }
      ]
    })
    await testRouter.push('/feedback')
    await testRouter.isReady()
    const wrapper = mount(FeedbackListPage, {
      global: { plugins: [createPinia(), testRouter, ElementPlus] }
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('FB-1'))
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
    expect(wrapper.text()).not.toContain('反馈列表接口待接入')
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/api/v1/admin/feedback')
  })

  it('loads the real detail and exposes detail and response routes', async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(
          JSON.stringify(
            String(_input).includes('/screenshot-url')
              ? {
                  expires_at: '2026-09-29T09:05:00Z',
                  url: 'https://signed.example/feedback-one'
                }
              : ticketResponse
          ),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 200
          }
        )
    )
    vi.stubGlobal('fetch', fetchSpy)
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        { component: FeedbackListPage, name: 'feedback', path: '/feedback' },
        { component: FeedbackDetailPage, name: 'feedback-detail', path: '/feedback/:id' },
        {
          component: FeedbackRespondPage,
          name: 'feedback-respond',
          path: '/feedback/:id/respond'
        }
      ]
    })
    await testRouter.push('/feedback/FB-1')
    await testRouter.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().$patch({ csrfToken: 'csrf-test' })
    const wrapper = mount(FeedbackDetailPage, {
      global: { plugins: [pinia, testRouter, ElementPlus] }
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('<b>原样反馈</b>'))
    expect(wrapper.find('b').exists()).toBe(false)
    expect(wrapper.text()).toContain('开始处理')
    expect(wrapper.text()).not.toContain('时间线接口待接入')
    wrapper.get('button[aria-label="查看反馈截图"]')
    await wrapper.get('button[aria-label="查看反馈截图"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('img[alt="反馈截图"]').exists()).toBe(true))
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/api/v1/admin/feedback/FB-1')
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain(
      '/api/v1/admin/feedback/FB-1/screenshot-url'
    )
  })
})

const ticketResponse = {
  category: 'CONTENT',
  closed_at: null,
  created_at: '2026-09-29T08:00:00Z',
  deadline_at: '2026-09-30T08:00:00Z',
  description: '<b>原样反馈</b>',
  id: 'FB-1',
  internal_notes: [],
  reopen_count: 0,
  replies: [],
  resolved_at: null,
  rounds: [],
  screenshots: [{ delete_after: null, deleted_at: null, security_status: 'PASSED' }],
  sla_remaining_seconds: 7200,
  source: { platform: 'miniapp' },
  status: 'PROCESSING',
  supplement_rounds: 1,
  timeline: [
    {
      actor_id: 'ADMIN-1',
      actor_type: 'ADMIN',
      event_type: 'PROCESSING_STARTED',
      occurred_at: '2026-09-29T08:30:00Z',
      payload: {},
      visibility: 'BOTH'
    }
  ],
  updated_at: '2026-09-29T09:00:00Z',
  user_id: 'USER-1'
}
