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

it('keeps queued and failed items honest and signals only newly persisted successes', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  let state = 'queued'
  request.mockImplementation(async () => ({
    id: 'worker-result',
    created_at: '2026-10-23T00:00:00Z',
    items: [
      {
        id: 'first',
        card_id: 'one',
        name: '重新发布',
        title_en: '',
        state,
        job_id: 'job-one',
        error_code: null
      },
      {
        id: 'second',
        card_id: 'two',
        name: '发布失败',
        title_en: '',
        state: 'failed',
        job_id: 'job-two',
        error_code: 'publish_failed'
      }
    ]
  }))
  const page = mount(SceneBatchPublication, {
    props: { batchId: 'worker-result' },
    global: { stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } } }
  })
  try {
    await flushPromises()
    expect(page.text()).toContain('成功 0 张')
    expect(page.text()).toContain('处理中 1 张')
    expect(page.text()).toContain('失败 1 张')
    expect(page.emitted('changed')).toBeUndefined()
    state = 'succeeded'
    await vi.advanceTimersByTimeAsync(1100)
    await flushPromises()
    expect(page.text()).toContain('成功 1 张')
    expect(page.text()).toContain('处理中 0 张')
    expect(page.emitted('changed')).toHaveLength(1)
    await page
      .findAll('button')
      .find((button) => button.text() === '刷新结果')!
      .trigger('click')
    await flushPromises()
    expect(page.emitted('changed')).toHaveLength(1)
  } finally {
    page.unmount()
    vi.clearAllTimers()
    vi.useRealTimers()
  }
})

it('retains processing on a query failure and clears the query error when the durable result recovers', async () => {
  const queued = {
    id: 'query-recovery',
    created_at: '',
    items: [
      {
        id: 'item',
        card_id: 'one',
        name: '等待结果',
        title_en: '',
        state: 'queued',
        job_id: 'worker',
        error_code: null
      }
    ]
  }
  request.mockResolvedValueOnce(queued)
  request.mockRejectedValueOnce(new ApiError('network_unknown', '结果查询连接中断'))
  const page = mount(SceneBatchPublication, {
    props: { batchId: 'query-recovery' },
    global: { stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } } }
  })
  try {
    await flushPromises()
    expect(page.get('.result-totals').text()).toContain('成功 0 张')
    expect(page.get('.result-totals').text()).toContain('处理中 1 张')
    expect(page.get('.result-totals').text()).toContain('失败 0 张')
    expect(page.get('[role="alert"]').text()).toContain('结果查询连接中断')
    request.mockResolvedValueOnce({
      ...queued,
      items: [{ ...queued.items[0], state: 'succeeded' }]
    })
    await page
      .findAll('button')
      .find((button) => button.text() === '刷新结果')!
      .trigger('click')
    await flushPromises()
    expect(page.get('.result-totals').text()).toContain('成功 1 张')
    expect(page.find('[role="alert"]').exists()).toBe(false)
  } finally {
    page.unmount()
  }
})
