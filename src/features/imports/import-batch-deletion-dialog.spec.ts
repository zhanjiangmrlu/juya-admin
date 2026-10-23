import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import { ApiError } from '@/services/http-client'

import type { ImportBatch } from '@/shared/types/import'

import ImportBatchDeletionDialog from './import-batch-deletion-dialog.vue'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
const pages: ReturnType<typeof mount>[] = []
const batch: ImportBatch = {
  id: 'batch/one',
  mode: 'zip',
  created_at: '',
  updated_at: '2026-10-23T01:02:03.123456Z',
  resumable: true,
  stage: 'review',
  source_names: ['保留正式卡片.zip'],
  files: [],
  items: [],
  unused_file_ids: []
}
/** 挂载真实批次确认组件，仅替换外部请求端口
 * @returns 可操作的确认弹窗
 */
const open = () => {
  const page = mount(ImportBatchDeletionDialog, {
    props: { batch: structuredClone(batch) },
    global: { stubs: { ElDialog: { template: '<section><slot/><slot name="footer"/></section>' } } }
  })
  pages.push(page)
  return page
}
afterEach(() => {
  pages.splice(0).forEach((page) => page.unmount())
  request.mockReset()
})

it('queries a lost receipt before retrying and freezes the exact version and key', async () => {
  const page = open()
  request.mockRejectedValueOnce(new ApiError('network_unknown', '网络连接中断'))
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  const original = request.mock.calls[0]!
  expect(original).toEqual([
    '/api/admin/v1/imports/batch%2Fone',
    {
      method: 'DELETE',
      body: { expected_updated_at: '2026-10-23T01:02:03.123456Z' },
      key: expect.any(String)
    }
  ])
  expect(page.get('[data-action="cancel-batch-deletion"]').attributes('disabled')).toBeDefined()
  await page.setProps({ batch: { ...batch, updated_at: 'later-version' } })
  request.mockRejectedValueOnce(new ApiError('not_found', '未找到回执', 404))
  request.mockResolvedValueOnce({ id: batch.id, deleted: true })
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  expect(request.mock.calls[1]![0]).toBe(`/api/admin/v1/operations/${original[1].key}`)
  expect(request.mock.calls[2]).toEqual(original)
  expect(page.emitted('deleted')).toEqual([[batch.id]])
})

it('accepts a persisted deletion receipt without sending a second DELETE', async () => {
  const page = open()
  request.mockRejectedValueOnce(new ApiError('response_unknown', '回执丢失', 200))
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  request.mockResolvedValueOnce({
    key: request.mock.calls[0]![1].key,
    result: { id: batch.id, deleted: true }
  })
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  expect(request.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(1)
  expect(page.emitted('deleted')).toEqual([[batch.id]])
})

it('does not resend deletion when the operation query itself fails', async () => {
  const page = open()
  request.mockRejectedValueOnce(new ApiError('network_unknown', '网络中断'))
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  request.mockRejectedValueOnce(new ApiError('unavailable', '查询暂不可用', 503))
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  expect(page.get('[role="alert"]').text()).toContain('查询暂不可用')
  expect(page.emitted('deleted')).toBeUndefined()
  expect(request.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(1)
})

it('does not remove the candidate for a mismatched receipt', async () => {
  const page = open()
  request.mockResolvedValueOnce({ id: 'different', deleted: true })
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await flushPromises()
  expect(page.emitted('deleted')).toBeUndefined()
  expect(page.get('[data-action="cancel-batch-deletion"]').attributes('disabled')).toBeDefined()
})

it('prevents duplicate submissions while the original DELETE is pending', async () => {
  const page = open()
  let finish: (value: unknown) => void = () => {}
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  await page.get('[data-action="confirm-batch-deletion"]').trigger('click')
  expect(request).toHaveBeenCalledTimes(1)
  expect(page.get('[data-action="cancel-batch-deletion"]').attributes('disabled')).toBeDefined()
  finish({ id: batch.id, deleted: true })
  await flushPromises()
  expect(page.emitted('deleted')).toEqual([[batch.id]])
})
