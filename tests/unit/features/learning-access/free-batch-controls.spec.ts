import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import FreeBatchControls from '@/features/learning-access/free-batch-controls.vue'
import { api, ApiError } from '@/services/http-client'

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
    global: { stubs: { Teleport: true, transition: false } }
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
    global: { stubs: { Teleport: true, transition: false } }
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
    global: { stubs: { Teleport: true, transition: false } }
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
    global: { stubs: { Teleport: true, transition: false } }
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
