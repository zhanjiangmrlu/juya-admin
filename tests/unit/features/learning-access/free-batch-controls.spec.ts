import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'

import FreeBatchControls from '@/features/learning-access/free-batch-controls.vue'
import { api, ApiError } from '@/services/http-client'
import { useAdminStore } from '@/stores/admin-store'

/** 使用真实Pinia提供明确管理员身份
 * @param id 隔离用例中的管理员标识
 * @returns 已初始化身份的真实插件
 */
const adminPinia = (id = 'admin-a') => {
  const pinia = createPinia()
  useAdminStore(pinia).identity = { id, username: id }
  return pinia
}
const item = {
  content_id: 'a',
  name: '完整名称',
  status: 'pending',
  version_id: 'v',
  free_revision: 1,
  is_free: false,
  reason: null,
  message: null
}
const preview = {
  content_type: 'scene',
  is_free: true,
  total: 1,
  applicable: 1,
  skipped: 0,
  items: [item],
  preview_token: 'frozen'
}
const result = {
  id: 'task-a',
  job_id: 'job-a',
  parent_id: null,
  content_type: 'scene',
  is_free: true,
  total: 1,
  pending: 0,
  succeeded: 1,
  skipped: 0,
  failed: 0,
  state: 'succeeded',
  created_at: '',
  items: [{ ...item, status: 'succeeded' }]
}
afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

it('cancel reads the complete preview but performs no business write and leaves selection', async () => {
  const request = vi.spyOn(api, 'request').mockResolvedValue(preview)
  const view = mount(FreeBatchControls, {
    props: { kind: 'scene', ids: ['a'] },
    global: { plugins: [adminPinia()], stubs: { Teleport: true, transition: false } }
  })
  await view.get('[data-action="enable-free"]').trigger('click')
  await flushPromises()
  expect(view.text()).toContain('完整名称')
  await view.get('[data-action="cancel-preview"]').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledTimes(1)
  expect(view.emitted('completed')).toBeUndefined()
  view.unmount()
})
it('queries the original operation after a lost acceptance response before any resend', async () => {
  const request = vi
    .spyOn(api, 'request')
    .mockResolvedValueOnce(preview)
    .mockRejectedValueOnce(new ApiError('network_unknown', '未知'))
    .mockResolvedValueOnce({ result })
  const view = mount(FreeBatchControls, {
    props: { kind: 'scene', ids: ['a'] },
    global: { plugins: [adminPinia()], stubs: { Teleport: true, transition: false } }
  })
  await view.get('[data-action="enable-free"]').trigger('click')
  await flushPromises()
  await view.get('[data-action="confirm-free"]').trigger('click')
  await flushPromises()
  expect(view.text()).toContain('查询本次结果')
  await view.get('[data-action="query-free"]').trigger('click')
  await flushPromises()
  expect(request.mock.calls[2]?.[0]).toMatch(/\/operations\//)
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2)
  expect(view.emitted('completed')).toEqual([[[]]])
  view.unmount()
})

it('fences list selection while an accepted task is pending and clears the fence on its terminal receipt', async () => {
  const queued = { ...result, state: 'running', succeeded: 0, pending: 1, items: [item] }
  const request = vi
    .spyOn(api, 'request')
    .mockResolvedValueOnce(preview)
    .mockResolvedValueOnce(queued)
    .mockResolvedValueOnce(result)
  const view = mount(FreeBatchControls, {
    props: { kind: 'scene', ids: ['a'] },
    global: { plugins: [adminPinia()], stubs: { Teleport: true, transition: false } }
  })
  await view.get('[data-action="enable-free"]').trigger('click')
  await flushPromises()
  await view.get('[data-action="confirm-free"]').trigger('click')
  await flushPromises()
  expect(view.emitted('processing')?.at(-1)).toEqual([true])
  await view
    .findAll('button')
    .find((button) => button.text() === '查询处理进度')!
    .trigger('click')
  await flushPromises()
  expect(view.emitted('processing')?.at(-1)).toEqual([false])
  expect(request).toHaveBeenCalledTimes(3)
  view.unmount()
})

it('keeps the original complete result available after cancelling a failure re-preview', async () => {
  vi.spyOn(api, 'request')
    .mockResolvedValueOnce(preview)
    .mockResolvedValueOnce({
      ...result,
      succeeded: 0,
      failed: 1,
      items: [{ ...item, status: 'failed', reason: 'publication_changed', message: '发布变化' }]
    })
    .mockResolvedValueOnce(preview)
  const view = mount(FreeBatchControls, {
    props: { kind: 'scene', ids: ['a'] },
    global: { plugins: [adminPinia()], stubs: { Teleport: true, transition: false } }
  })
  await view.get('[data-action="enable-free"]').trigger('click')
  await flushPromises()
  await view.get('[data-action="confirm-free"]').trigger('click')
  await flushPromises()
  await view
    .findAll('button')
    .find((button) => button.text() === '仅重试1张失败项')!
    .trigger('click')
  await flushPromises()
  await view.get('[data-action="cancel-preview"]').trigger('click')
  await flushPromises()
  expect(view.findAll('button').some((button) => button.text() === '查看本次结果')).toBe(true)
  view.unmount()
})

it('restores a failed first task GET through a fenced read-only query without POST', async () => {
  const processing = vi.fn(),
    completed = vi.fn()
  const taskKey = `juya-free-task:${location.origin}:admin-a:scene`
  sessionStorage.setItem(taskKey, 'restoring-task')
  const request = vi
    .spyOn(api, 'request')
    .mockRejectedValueOnce(new ApiError('network_unknown', '首次读取失败'))
    .mockResolvedValueOnce({ ...result, id: 'restoring-task' })
  const view = mount(FreeBatchControls, {
    props: { kind: 'scene', ids: ['a'], onProcessing: processing, onCompleted: completed },
    global: { plugins: [adminPinia()], stubs: { Teleport: true, transition: false } }
  })
  expect(processing).toHaveBeenLastCalledWith(true)
  await flushPromises()
  expect(view.get('[data-action="enable-free"]').attributes('disabled')).toBeDefined()
  expect(view.find('[data-action="query-task"]').exists()).toBe(true)
  await view.get('[data-action="query-task"]').trigger('click')
  await flushPromises()
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    '/api/admin/v1/free-access-batches/restoring-task',
    '/api/admin/v1/free-access-batches/restoring-task'
  ])
  expect(request.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  expect(completed).toHaveBeenCalledExactlyOnceWith([])
  expect(view.get('[data-action="enable-free"]').attributes('disabled')).toBeUndefined()
  view.unmount()
})

it('keeps two real Pinia administrators isolated in every runtime including production', async () => {
  sessionStorage.setItem(`juya-free-task:${location.origin}:admin-a:scene`, 'a-task')
  sessionStorage.setItem(`juya-free-task:${location.origin}:admin-b:scene`, 'b-task')
  const request = vi.spyOn(api, 'request').mockImplementation(async (path) => ({
    ...result,
    id: path.endsWith('a-task') ? 'a-task' : 'b-task'
  }))
  for (const owner of ['admin-a', 'admin-b']) {
    const view = mount(FreeBatchControls, {
      props: { kind: 'scene', ids: [] },
      global: { plugins: [adminPinia(owner)], stubs: { Teleport: true, transition: false } }
    })
    await flushPromises()
    view.unmount()
  }
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    '/api/admin/v1/free-access-batches/a-task',
    '/api/admin/v1/free-access-batches/b-task'
  ])
  expect(Object.keys(sessionStorage).some((key) => key.includes(':isolated:'))).toBe(false)
})

it.each(['identity-change', 'unmount'])(
  'discards late acceptance after %s and never rewrites cleared tracking',
  async (stop) => {
    let finish!: (value: unknown) => void
    const request = vi
      .spyOn(api, 'request')
      .mockResolvedValueOnce(preview)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
    const pinia = adminPinia(),
      admin = useAdminStore(pinia)
    const view = mount(FreeBatchControls, {
      props: { kind: 'scene', ids: ['a'] },
      global: { plugins: [pinia], stubs: { Teleport: true, transition: false } }
    })
    await view.get('[data-action="enable-free"]').trigger('click')
    await flushPromises()
    await view.get('[data-action="confirm-free"]').trigger('click')
    await flushPromises()
    expect(request).toHaveBeenCalledTimes(2)
    sessionStorage.clear()
    if (stop === 'unmount') view.unmount()
    else admin.identity = { id: 'admin-b', username: 'admin-b' }
    finish(result)
    await flushPromises()
    expect(sessionStorage.length).toBe(0)
    expect(view.emitted('completed')).toBeUndefined()
    if (stop !== 'unmount') view.unmount()
  }
)

it('ignores a late old-owner restore while the new administrator reads only its own task', async () => {
  const completed = vi.fn()
  const aKey = `juya-free-task:${location.origin}:admin-a:scene`,
    bKey = `juya-free-task:${location.origin}:admin-b:scene`
  sessionStorage.setItem(aKey, 'a-task')
  sessionStorage.setItem(bKey, 'b-task')
  let finishOld!: (value: unknown) => void
  const request = vi.spyOn(api, 'request').mockImplementation(async (path) =>
    path.endsWith('a-task')
      ? new Promise((resolve) => {
          finishOld = resolve
        })
      : { ...result, id: 'b-task' }
  )
  const pinia = adminPinia(),
    admin = useAdminStore(pinia)
  const view = mount(FreeBatchControls, {
    props: { kind: 'scene', ids: [], onCompleted: completed },
    global: { plugins: [pinia], stubs: { Teleport: true, transition: false } }
  })
  await flushPromises()
  admin.identity = { id: 'admin-b', username: 'admin-b' }
  await flushPromises()
  finishOld({ ...result, id: 'late-a-task' })
  await flushPromises()
  expect(sessionStorage.getItem(aKey)).toBe('a-task')
  expect(sessionStorage.getItem(bKey)).toBe('b-task')
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    '/api/admin/v1/free-access-batches/a-task',
    '/api/admin/v1/free-access-batches/b-task'
  ])
  expect(completed).toHaveBeenCalledExactlyOnceWith([])
  view.unmount()
})
