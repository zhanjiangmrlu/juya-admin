import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/http-client')>()),
  api: { request }
}))
import { ApiError } from '@/services/http-client'

import SceneBatchPublication from './scene-batch-publication.vue'

it('allows a fresh review after a confirmed rejection instead of claiming acceptance is unknown', async () => {
  const content = {
    name: 'One',
    title_en: '',
    image_id: null,
    audio_id: null,
    dialogue: [],
    vocabulary: [],
    chunks: []
  }
  request.mockImplementation(async (path: string) => {
    if (path === '/api/admin/v1/publication-batches')
      throw new ApiError('preview_expired', '预览已过期', 410)
    if (path.endsWith('/preview'))
      return { preview_id: 'review', revision: 1, content, mode: 'draft' }
    return {
      id: 'one',
      content,
      draft_revision: 1,
      status: 'draft',
      has_unpublished_changes: true,
      issues: []
    }
  })
  const page = mount(SceneBatchPublication, {
    props: { cardIds: ['one'] },
    global: { stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } } }
  })
  await flushPromises()
  await page.get('[data-action="confirm-reviewed"]').setValue(true)
  await page.get('[data-action="publish-reviewed"]').trigger('click')
  await flushPromises()
  expect(page.text()).not.toContain('查询接收结果')
  expect(page.text()).toContain('重新获取核对资料')
  await page.get('[data-action="refresh-review"]').trigger('click')
  await flushPromises()
  expect(page.get('[data-action="confirm-reviewed"]').element).toHaveProperty('checked', false)
  page.unmount()
})
it('requires reviewed confirmation and submits only the latest eligible cards', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const submitted: unknown[] = []
  const content = {
    name: 'One',
    title_en: '',
    image_id: null,
    audio_id: null,
    dialogue: [],
    vocabulary: [],
    chunks: []
  }
  request.mockImplementation(
    async (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === '/api/admin/v1/publication-batches') {
        submitted.push(options?.body)
        return {
          id: 'accepted',
          created_at: '2026-10-17T00:00:00Z',
          items: [
            {
              id: 'item',
              card_id: 'one',
              name: 'One',
              state: 'queued',
              job_id: 'job',
              error_code: null
            }
          ]
        }
      }
      if (path === '/api/admin/v1/publication-batches/accepted')
        return {
          id: 'accepted',
          created_at: '2026-10-17T00:00:00Z',
          items: [
            {
              id: 'item',
              card_id: 'one',
              name: 'One',
              state: 'succeeded',
              job_id: 'job',
              error_code: null
            }
          ]
        }
      if (path.endsWith('/preview'))
        return {
          preview_id: 'review-one',
          revision: 2,
          content,
          mode: 'draft',
          expires_at: '2026-10-17T01:00:00Z'
        }
      const id = path.split('/').at(-1)
      return {
        id,
        content: { ...content, name: id },
        draft_revision: 2,
        status: id === 'three' ? 'published' : 'draft',
        has_unpublished_changes: id !== 'three',
        issues: id === 'two' ? [{ field: 'image_id', message: '缺少场景图片' }] : []
      }
    }
  )
  const page = mount(SceneBatchPublication, {
    props: { cardIds: ['one', 'two', 'three'] },
    global: { stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } } }
  })
  try {
    await flushPromises()
    expect(page.text()).toContain('可发布 1 张')
    expect(page.text()).toContain('待补充 1 张')
    expect(page.text()).toContain('无需发布 1 张')
    expect(page.get('[data-action="publish-reviewed"]').attributes('disabled')).toBeDefined()
    await page.get('[data-action="confirm-reviewed"]').setValue(true)
    await page.get('[data-action="publish-reviewed"]').trigger('click')
    await flushPromises()
    expect(submitted).toEqual([
      { confirmed: true, items: [{ card_id: 'one', revision: 2, preview_id: 'review-one' }] }
    ])
    await vi.advanceTimersByTimeAsync(1100)
    await flushPromises()
    expect(page.text()).toContain('成功 1 张')
  } finally {
    page.unmount()
    pause.mockRestore()
    vi.clearAllTimers()
    vi.useRealTimers()
  }
})
