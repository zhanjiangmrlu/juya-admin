import { expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const value = await original<typeof import('@/services/http-client')>()
  return { ...value, api: { request } }
})
import { ApiError } from '@/services/http-client'

import { useAccessOperation } from './use-access-operation'

it('recovers an unknown renewal using the original receipt without issuing a second PUT', async () => {
  request.mockReset()
  const operation = useAccessOperation<{ status: string }>(
    '/grant',
    (value) => value.status === 'active'
  )
  operation.prepare('confirmed-snapshot')
  request.mockRejectedValueOnce(new ApiError('network_unknown', '响应未知'))
  expect(await operation.submit()).toBeNull()
  expect(operation.unknown.value).toBe(true)
  request.mockResolvedValueOnce({ result: { status: 'active' } })
  expect(await operation.submit()).toEqual({ status: 'active' })
  expect(request.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1)
  expect(request.mock.calls[1][0]).toContain('/operations/')
})

it('only retries the frozen request after an explicit missing receipt and rejects stale confirmation', async () => {
  request.mockReset()
  const operation = useAccessOperation<{ status: string }>(
    '/grant',
    (value) => value.status === 'active'
  )
  operation.prepare('snapshot')
  request.mockRejectedValueOnce(new ApiError('network_unknown', '未知'))
  await operation.submit()
  const original = request.mock.calls[0][1]
  request.mockRejectedValueOnce(new ApiError('operation_unknown', '无回执', 404))
  request.mockResolvedValueOnce({ status: 'active' })
  await operation.submit()
  expect(request.mock.calls[2][1]).toEqual(original)
  operation.prepare('new-snapshot')
  request.mockRejectedValueOnce(new ApiError('authorization_changed', '请重核对', 409))
  expect(await operation.submit()).toBeNull()
  expect(operation.stale.value).toBe(true)
})
