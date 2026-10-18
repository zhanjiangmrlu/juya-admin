import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
import SceneCardActions from './scene-card-actions.vue'

const failedBatch = {
  id: 'old',
  action: 'offline',
  created_at: '',
  items: [
    {
      id: 'failure',
      card_id: 'failed',
      name: '原失败卡',
      state: 'failed',
      job_id: 'job',
      error_code: 'revision_conflict',
      needs_review: true
    },
    {
      id: 'success',
      card_id: 'done',
      name: '已成功卡',
      state: 'succeeded',
      job_id: 'job2',
      error_code: null,
      needs_review: false
    }
  ]
}

it('keeps the recovered action and original failed scope when rechecking is retried', async () => {
  sessionStorage.setItem(
    'juya-pending-card-actions',
    JSON.stringify({
      key: 'original',
      body: { action: 'offline', confirmed: true, items: [], skipped: [] }
    })
  )
  let reads = 0
  request.mockImplementation(async (path, options) => {
    if (path.includes('/operations/')) return { result: failedBatch }
    if (path.endsWith('/cards/failed')) {
      if (++reads === 1) throw new TypeError('temporarily unavailable')
      return {
        id: 'failed',
        status: 'published',
        draft_revision: 3,
        current_version_id: 'v2',
        display_name: '原失败卡'
      }
    }
    if (options?.method === 'POST') return { ...failedBatch, id: 'new' }
    return failedBatch
  })
  const page = mount(SceneCardActions, {
    props: { action: 'delete', cardIds: [] },
    global: { stubs: { ElDialog: dialog } }
  })
  await flushPromises()
  await page.get('[data-action="recover-card-actions"]').trigger('click')
  await flushPromises()
  await page
    .findAll('button')
    .find((button) => button.text() === '重新核对失败项')!
    .trigger('click')
  await flushPromises()
  await page
    .findAll('button')
    .find((button) => button.text() === '重新读取核对资料')!
    .trigger('click')
  await flushPromises()
  expect(page.text()).toContain('可下线 1 张')
  await page.get('[data-action="confirm-card-actions"]').trigger('click')
  await flushPromises()
  expect(
    request.mock.calls.find(([, options]) => options?.method === 'POST')?.[1].body
  ).toMatchObject({ action: 'offline', items: [{ card_id: 'failed' }], skipped: [] })
  expect(request.mock.calls.some(([path]) => path.endsWith('/cards/done'))).toBe(false)
  page.unmount()
})

it('ignores a delayed result query after starting failed-item confirmation', async () => {
  let complete: (value: unknown) => void = () => {}
  let reads = 0
  request.mockImplementation(async (path) => {
    if (path.endsWith('/cards/failed'))
      return {
        id: 'failed',
        status: 'published',
        draft_revision: 3,
        current_version_id: 'v2',
        display_name: '原失败卡'
      }
    if (++reads === 1) return failedBatch
    return new Promise((resolve) => {
      complete = resolve
    })
  })
  const page = mount(SceneCardActions, {
    props: { action: 'offline', cardIds: [], batchId: 'old' },
    global: { stubs: { ElDialog: dialog } }
  })
  await flushPromises()
  await page
    .findAll('button')
    .find((button) => button.text() === '重新核对失败项')!
    .trigger('click')
  await flushPromises()
  complete(failedBatch)
  await flushPromises()
  expect(page.text()).toContain('可下线 1 张')
  expect(page.find('[data-action="confirm-card-actions"]').exists()).toBe(true)
  page.unmount()
})

it('recovers a lost failed-only retry after remount by querying its receipt first', async () => {
  const result = {
    ...failedBatch,
    items: [{ ...failedBatch.items[0], error_code: 'worker_interrupted', needs_review: false }]
  }
  request.mockImplementation(async (path, options) => {
    if (options?.method === 'POST') throw new TypeError('response lost')
    if (path.includes('/operations/'))
      return { result: { ...result, items: [{ ...result.items[0], state: 'succeeded' }] } }
    return result
  })
  const props = { action: 'offline' as const, cardIds: [], batchId: 'old' }
  const page = mount(SceneCardActions, { props, global: { stubs: { ElDialog: dialog } } })
  await flushPromises()
  expect(page.text()).toContain('处理进程中断')
  await page
    .findAll('button')
    .find((button) => button.text() === '重试失败项')!
    .trigger('click')
  await flushPromises()
  page.unmount()
  const recovered = mount(SceneCardActions, {
    props: { action: 'delete', cardIds: [] },
    global: { stubs: { ElDialog: dialog } }
  })
  await flushPromises()
  expect(recovered.find('[data-action="recover-card-actions"]').exists()).toBe(true)
  await recovered.get('[data-action="recover-card-actions"]').trigger('click')
  await flushPromises()
  expect(recovered.text()).toContain('成功 1 张')
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  recovered.unmount()
})

const dialog = { template: '<section><slot/><slot name="footer"/></section>' }
afterEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

it('confirms only published members, records skipped members and recovers a lost acceptance', async () => {
  const calls: { body?: unknown; key?: string }[] = []
  const result = {
    id: 'batch',
    action: 'offline',
    created_at: '',
    items: [
      {
        id: 'a',
        card_id: 'live',
        name: '线上卡',
        state: 'succeeded',
        job_id: 'job',
        error_code: null,
        needs_review: false
      },
      {
        id: 'b',
        card_id: 'draft',
        name: '草稿卡',
        state: 'skipped',
        job_id: null,
        error_code: 'not_applicable',
        needs_review: false
      }
    ]
  }
  request.mockImplementation(async (path, options) => {
    if (path.includes('/operations/')) return { result }
    if (path === '/api/admin/v1/card-action-batches') {
      calls.push(options)
      throw new TypeError('lost')
    }
    return {
      id: path.endsWith('/live') ? 'live' : 'draft',
      display_name: path.endsWith('/live') ? '线上卡' : '草稿卡',
      draft_revision: 2,
      current_version_id: path.endsWith('/live') ? 'v1' : null,
      status: path.endsWith('/live') ? 'published' : 'draft'
    }
  })
  const page = mount(SceneCardActions, {
    props: { action: 'offline', cardIds: ['live', 'draft'] },
    global: { stubs: { ElDialog: dialog } }
  })
  await flushPromises()
  expect(page.text()).toContain('可下线 1 张')
  expect(page.text()).toContain('跳过 1 张')
  await page.get('[data-action="confirm-card-actions"]').trigger('click')
  await flushPromises()
  expect(calls[0]?.body).toMatchObject({
    action: 'offline',
    items: [{ card_id: 'live', revision: 2, status: 'published', version_id: 'v1' }],
    skipped: [{ card_id: 'draft' }]
  })
  expect(page.text()).toContain('结果待确认')
  await page.get('[data-action="recover-card-actions"]').trigger('click')
  await flushPromises()
  expect(calls).toHaveLength(1)
  expect(page.text()).toContain('成功 1 张')
  page.unmount()
})

it('disables empty offline sets and keeps cancellation free of writes', async () => {
  request.mockResolvedValue({
    id: 'one',
    display_name: '草稿',
    draft_revision: 1,
    status: 'draft',
    current_version_id: null
  })
  const page = mount(SceneCardActions, {
    props: { action: 'offline', cardIds: ['one'] },
    global: { stubs: { ElDialog: dialog } }
  })
  await flushPromises()
  expect(page.get('[data-action="confirm-card-actions"]').attributes('disabled')).toBeDefined()
  await page.get('[data-action="close-card-actions"]').trigger('click')
  expect(page.emitted('close')).toBeTruthy()
  expect(request.mock.calls.every(([, options]) => !options?.method)).toBe(true)
  page.unmount()
})
