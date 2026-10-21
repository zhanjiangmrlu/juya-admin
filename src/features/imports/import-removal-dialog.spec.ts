import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { ApiError } from '@/services/http-client'

import ImportRemovalDialog from './import-removal-dialog.vue'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))

it('retains a frozen removal and its key after a lost response', async () => {
  request.mockReset()
  request.mockRejectedValueOnce(new ApiError('network_unknown', '结果待确认'))
  request.mockResolvedValueOnce({ items: [], files: [] })
  const page = mount(ImportRemovalDialog, {
    props: {
      batchId: 'batch',
      selection: { kind: 'items', rows: [{ id: 'duplicate', revision: 3, name: '重复卡片' }] }
    },
    global: { stubs: { ElDialog: { template: '<div><slot/><slot name="footer"/></div>' } } }
  })
  expect(page.text()).toContain('重复卡片')
  await page.get('[data-action="confirm-import-removal"]').trigger('click')
  await flushPromises()
  expect(page.emitted('removed')).toBeUndefined()
  expect(page.get('[role="alert"]').text()).toContain('结果待确认')
  await page.get('[data-action="confirm-import-removal"]').trigger('click')
  await flushPromises()
  expect(request.mock.calls[1]?.[1]).toEqual(request.mock.calls[0]?.[1])
  expect(request.mock.calls[1]?.[1].body).toEqual({ items: [{ id: 'duplicate', revision: 3 }] })
  expect(page.emitted('removed')?.[0]).toEqual([{ fileIds: [], itemIds: ['duplicate'] }])
  page.unmount()
})
