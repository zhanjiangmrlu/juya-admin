import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/errors/api-error'

import { createApiClient } from './api-client'

/**
 * 创建测试使用的 JSON 响应。
 *
 * @param body - 需要序列化的响应体。
 * @param status - HTTP 状态码。
 * @returns 包含 JSON 内容类型的响应对象。
 */
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status
  })

describe('api client', () => {
  it('adds CSRF, request ID and idempotency headers to write requests', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }))
    const client = createApiClient({
      baseUrl: 'https://admin-api.example.com/api/v1/admin',
      fetchImplementation,
      getCsrfToken: () => 'csrf-1'
    })

    await client.request({
      body: { reason: '人工处理' },
      idempotencyKey: 'idem-1',
      method: 'POST',
      path: '/command'
    })

    const [, init] = fetchImplementation.mock.calls[0] ?? []
    const headers = new Headers(init?.headers)

    expect(init?.credentials).toBe('include')
    expect(headers.get('X-CSRF-Token')).toBe('csrf-1')
    expect(headers.get('X-Idempotency-Key')).toBe('idem-1')
    expect(headers.get('X-Request-ID')).toMatch(/^web-/)
  })

  it.each([401, 403, 409, 422, 429, 500])('maps HTTP %s responses to ApiError', async (status) => {
    const onUnauthorized = vi.fn()
    const client = createApiClient({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            code: `ERROR_${status}`,
            details: { field: 'value' },
            message: '服务端提示',
            request_id: `request-${status}`
          },
          status
        )
      ),
      onUnauthorized
    })

    const error = await client
      .request({ method: 'GET', path: '/resource' })
      .catch((reason) => reason)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: `ERROR_${status}`,
      requestId: `request-${status}`,
      status
    })
    expect(onUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
  })

  it('uses a safe generic message when the error payload has no request_id', async () => {
    const client = createApiClient({
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ message: '可能包含内部细节' }, 500))
    })

    const error = await client
      .request({ method: 'GET', path: '/resource' })
      .catch((reason) => reason)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      message: '服务暂时不可用，请稍后重试',
      requestId: expect.stringMatching(/^web-/),
      status: 500
    })
  })

  it('preserves AbortError so cancelled requests are not shown as business errors', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    const client = createApiClient({
      fetchImplementation: vi.fn<typeof fetch>().mockRejectedValue(abortError)
    })

    await expect(client.request({ method: 'GET', path: '/resource' })).rejects.toBe(abortError)
  })
})
