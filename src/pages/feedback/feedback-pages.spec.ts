import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import PlainTextContent from '@/components/plain-text-content/plain-text-content.vue'

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

  it('shows the pending list capability without sending a request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const wrapper = mount(FeedbackListPage, { global: { plugins: [ElementPlus] } })

    await Promise.resolve()
    expect(wrapper.text()).toContain('反馈列表接口待接入')
    expect(wrapper.text()).toContain('0 个未知请求')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('loads the real detail and exposes detail and response routes', async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(JSON.stringify(ticketResponse), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        })
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
    const wrapper = mount(FeedbackDetailPage, {
      global: { plugins: [createPinia(), testRouter, ElementPlus] }
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('<b>原样反馈</b>'))
    expect(wrapper.find('b').exists()).toBe(false)
    expect(wrapper.text()).toContain('时间线接口待接入')
    expect(wrapper.text()).toContain('截图访问能力待接入')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/api/v1/admin/feedback/FB-1')
  })
})

const ticketResponse = {
  category: 'CONTENT',
  closed_at: null,
  created_at: '2026-09-29T08:00:00Z',
  deadline_at: '2026-09-30T08:00:00Z',
  description: '<b>原样反馈</b>',
  id: 'FB-1',
  reopen_count: 0,
  resolved_at: null,
  sla_remaining_seconds: 7200,
  source: { platform: 'miniapp' },
  status: 'PROCESSING',
  supplement_rounds: 1,
  updated_at: '2026-09-29T09:00:00Z',
  user_id: 'USER-1'
}
