import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { api, ApiError } from '@/services/http-client'

import FreeAccessControl from './free-access-control.vue'

it('changes only its own object and emits the confirmed state', async () => {
  const request = vi
    .spyOn(api, 'request')
    .mockResolvedValue({ is_free: true, revision: 8, effective: true })
  const page = mount(FreeAccessControl, {
    props: { path: '/api/admin/v1/cards/a/free-access', isFree: false, revision: 7 }
  })
  await page.get('button').trigger('click')
  await flushPromises()
  expect(request.mock.calls[0]).toEqual([
    '/api/admin/v1/cards/a/free-access',
    expect.objectContaining({ method: 'PUT', body: { is_free: true, revision: 7 } })
  ])
  expect(page.emitted('changed')).toEqual([[{ is_free: true, revision: 8, effective: true }]])
  request.mockRestore()
})
it('queries an unknown operation before retrying the frozen request', async () => {
  const request = vi
    .spyOn(api, 'request')
    .mockRejectedValueOnce(new ApiError('network_unknown', '连接中断'))
    .mockResolvedValueOnce({ result: { is_free: true, revision: 8, effective: true } })
  const page = mount(FreeAccessControl, {
    props: { path: '/api/admin/v1/cards/a/free-access', isFree: false, revision: 7 }
  })
  await page.get('button').trigger('click')
  await flushPromises()
  expect(page.text()).toContain('查询本次结果')
  await page.get('button').trigger('click')
  await flushPromises()
  expect(request.mock.calls[1]?.[0]).toMatch(/^\/api\/admin\/v1\/operations\//)
  expect(request.mock.calls).toHaveLength(2)
  expect(page.emitted('changed')).toHaveLength(1)
  request.mockRestore()
})
it('keeps a failed row actionable without changing its displayed saved state', async () => {
  const request = vi
    .spyOn(api, 'request')
    .mockRejectedValueOnce(new ApiError('conflict', '状态已变更', 409))
    .mockResolvedValueOnce({ is_free: false, revision: 9, effective: false })
  const page = mount(FreeAccessControl, {
    props: { path: '/api/admin/v1/cards/a/free-access', isFree: false, revision: 7 }
  })
  await page.get('button').trigger('click')
  await flushPromises()
  expect(page.text()).toContain('状态已变更')
  expect(page.text()).toContain('启用免费')
  expect(page.emitted('changed')).toEqual([[{ is_free: false, revision: 9, effective: false }]])
  request.mockRestore()
})
