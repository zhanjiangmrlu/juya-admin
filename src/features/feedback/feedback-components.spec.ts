import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', () => ({ api: { request } }))

import type { FeedbackDetail } from '@/shared/types/feedback'

import FeedbackImagePreview from './feedback-image-preview.vue'
import FeedbackReplyForm from './feedback-reply-form.vue'
import FeedbackTimeline from './feedback-timeline.vue'

const image = {
  id: 'opaque-image-id',
  state: 'ready' as const,
  url: '/api/admin/v1/feedback/images/first-grant',
  content_type: 'image/png',
  width: 300,
  height: 200,
  size: 200
}

beforeEach(() => request.mockReset())

it('counts Unicode codepoints and does not infer a status from a plain reply', async () => {
  const page = mount(FeedbackReplyForm, {
    props: {
      text: '😀'.repeat(500),
      status: '',
      current: 'needs_info',
      busy: false,
      blocked: false
    }
  })
  expect(page.text()).toContain('500／500')
  expect(page.get('[data-action="send-feedback"]').attributes('disabled')).toBeUndefined()
  await page.get('form').trigger('submit')
  expect(page.emitted('send')).toHaveLength(1)
  expect(page.emitted('update:status')).toBeUndefined()
  await page.setProps({ text: '😀'.repeat(501) })
  expect(page.get('[data-action="send-feedback"]').attributes('disabled')).toBeDefined()
  await page.setProps({ text: '   ', status: 'needs_info' })
  expect(page.get('[data-action="send-feedback"]').attributes('disabled')).toBeDefined()
  await page.setProps({ status: 'processing' })
  expect(page.get('[data-action="send-feedback"]').attributes('disabled')).toBeUndefined()
  page.unmount()
})

it('keeps source unavailable and timeline safe while a private screenshot fails and is renewed', async () => {
  request.mockResolvedValue({ ...image, url: '/api/admin/v1/feedback/images/new-grant' })
  const page = mount(FeedbackTimeline, {
    props: {
      detail: {
        id: 'one',
        user_id: 'user',
        user_code: 'Juya001',
        category: 'content',
        status: 'pending',
        source_title: '安全名称',
        source_title_en: 'Safe title',
        card_id: 'card',
        source_available: false,
        source_unavailable_reason: 'deleted',
        events: [
          {
            id: 1,
            actor: 'user',
            text: '<img src=x>原说明',
            status: null,
            images: [image],
            created_at: '2026-10-22T01:00:00Z'
          }
        ]
      } as FeedbackDetail
    },
    global: { stubs: { ElDialog: true } }
  })
  expect(page.text()).toContain('来源已删除')
  expect(page.get('h2').text()).toBe('one · Juya001')
  expect(page.find('a').exists()).toBe(false)
  expect(page.find('img[src=x]').exists()).toBe(false)
  const thumbnail = page.get('img[alt="查看反馈截图"]')
  expect(thumbnail.attributes('src')).toContain('first-grant')
  await thumbnail.trigger('error')
  expect(page.text()).toContain('原说明')
  await page.get('.feedback-screenshots button').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledWith('/api/admin/v1/feedback/images/opaque-image-id/url')
  expect(page.get('img[alt="查看反馈截图"]').attributes('src')).toContain('new-grant')
  expect(request.mock.calls.every(([, options]) => !options?.method)).toBe(true)
  page.unmount()
})

it('renews an expired preview instead of reuploading an attachment', async () => {
  request.mockResolvedValue({ ...image, url: '/api/admin/v1/feedback/images/renewed-preview' })
  const page = mount(FeedbackImagePreview, {
    props: { image },
    global: { stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } } }
  })
  await page.get('img').trigger('error')
  expect(page.text()).toContain('截图地址可能已过期')
  await page
    .findAll('button')
    .find((button) => button.text() === '重新获取截图')!
    .trigger('click')
  await flushPromises()
  expect(page.get('img').attributes('src')).toContain('renewed-preview')
  expect(request).toHaveBeenCalledTimes(1)
  await page
    .findAll('button')
    .find((button) => button.text() === '关闭')!
    .trigger('click')
  expect(page.emitted('close')).toHaveLength(1)
  page.unmount()
})
