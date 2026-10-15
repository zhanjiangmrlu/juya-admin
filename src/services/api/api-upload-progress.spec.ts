import { describe, expect, it, vi } from 'vitest'

import { createApiClient } from './api-client'

const /** 创建上传边界替身，保留真实客户端的认证、响应与取消处理
   * @returns 当前操作结果或完成状态
   */
  transport = () => {
    const xhr = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(),
      withCredentials: false,
      responseType: '',
      response: new ArrayBuffer(0),
      status: 200,
      upload: {
        onprogress: null as
          ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null
      },
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      ontimeout: null as (() => void) | null,
      getAllResponseHeaders: () => 'content-type: application/json\r\n',
      /** 模拟浏览器确认请求已取消
       * @returns 当前操作结果或完成状态
       */
      abort: vi.fn(() => xhr.onabort?.())
    }
    return {
      xhr,
      factory: () => xhr as unknown as XMLHttpRequest,
      /**
       * 返回 HTTP 响应，body 为实际响应载荷，status 为状态码
       * @param body - 本次请求或响应载荷
       * @param status - 服务端状态
       * @returns 当前操作结果或完成状态
       */
      respond: (body: unknown, status = 200) => {
        xhr.response = new TextEncoder().encode(JSON.stringify(body)).buffer as ArrayBuffer
        xhr.status = status
        xhr.onload?.()
      }
    }
  }

describe('认证文件上传进度', () => {
  it('传递真实进度且传输100%不会提前完成请求，保留认证和幂等头', async () => {
    const t = transport(),
      progress = vi.fn(),
      done = vi.fn(),
      fallback = vi.fn().mockResolvedValue(new Response('{}'))
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      xhrFactory: t.factory,
      fetchImplementation: fallback,
      getCsrfToken: () => 'csrf'
    })
    const body = new FormData()
    body.set('file', new File(['zip'], 'three.zip'))
    const result = client
      .request({
        method: 'POST',
        path: '/upload',
        body,
        headers: { 'Idempotency-Key': 'same-upload' },
        onUploadProgress: progress
      })
      .then(done)
    expect(t.xhr.open).toHaveBeenCalledWith('POST', 'https://api.example.com/upload')
    expect(t.xhr.withCredentials).toBe(true)
    expect(t.xhr.setRequestHeader).toHaveBeenCalledWith('x-csrf-token', 'csrf')
    expect(t.xhr.setRequestHeader).toHaveBeenCalledWith('idempotency-key', 'same-upload')
    expect(t.xhr.setRequestHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.stringMatching(/^web-/)
    )
    expect(t.xhr.send).toHaveBeenCalledWith(body)
    t.xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 })
    expect(progress).toHaveBeenLastCalledWith(25)
    t.xhr.upload.onprogress?.({ lengthComputable: true, loaded: 999, total: 1000 })
    expect(progress).toHaveBeenLastCalledWith(99)
    t.xhr.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 4 })
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    t.respond({ work_order_id: 'order' }, 202)
    await result
    expect(done).toHaveBeenCalledWith({ work_order_id: 'order' })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('不可计算的传输量不伪造百分比', async () => {
    const t = transport(),
      onUploadProgress = vi.fn()
    const client = createApiClient({
      xhrFactory: t.factory,
      fetchImplementation: vi.fn().mockResolvedValue(new Response('{}'))
    })
    const pending = client.request({
      method: 'POST',
      path: '/upload',
      body: new FormData(),
      onUploadProgress
    })
    t.xhr.upload.onprogress?.({ lengthComputable: false, loaded: 1, total: 0 })
    expect(onUploadProgress).toHaveBeenCalledWith(null)
    t.respond({ ok: true })
    await pending
  })

  it('上传保留统一401错误并触发会话失效回调', async () => {
    const t = transport(),
      onUnauthorized = vi.fn()
    const client = createApiClient({
      xhrFactory: t.factory,
      onUnauthorized,
      fetchImplementation: vi.fn().mockResolvedValue(new Response('{}'))
    })
    const pending = client.request({
      method: 'POST',
      path: '/upload',
      body: new FormData(),
      onUploadProgress: vi.fn()
    })
    t.respond({ code: 'SESSION_EXPIRED', request_id: 'expired', message: '登录已失效' }, 401)
    await expect(pending).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      status: 401,
      requestId: 'expired'
    })
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('缺少CSRF时不发出上传', async () => {
    const t = transport(),
      factory = vi.fn(t.factory)
    const client = createApiClient({ xhrFactory: factory, getCsrfToken: () => null })
    await expect(
      client.request({
        method: 'POST',
        path: '/upload',
        body: new FormData(),
        onUploadProgress: vi.fn()
      })
    ).rejects.toMatchObject({ code: 'CSRF_TOKEN_MISSING' })
    expect(factory).not.toHaveBeenCalled()
  })

  it.each([false, true])('取消上传不会产生成功响应，预先取消=%s', async (before) => {
    const t = transport(),
      controller = new globalThis.AbortController()
    const client = createApiClient({
      xhrFactory: t.factory,
      fetchImplementation: vi.fn().mockResolvedValue(new Response('{}'))
    })
    if (before) controller.abort()
    const pending = client.request({
      method: 'POST',
      path: '/upload',
      body: new FormData(),
      signal: controller.signal,
      onUploadProgress: vi.fn()
    })
    if (!before) controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    if (before) expect(t.xhr.send).not.toHaveBeenCalled()
  })

  it('不携带回调的文件请求仍走fetch', async () => {
    const t = transport(),
      fetchImplementation = vi.fn().mockResolvedValue(new Response('{}'))
    const client = createApiClient({ xhrFactory: t.factory, fetchImplementation })
    await client.request({ method: 'POST', path: '/upload', body: new FormData() })
    expect(fetchImplementation).toHaveBeenCalledOnce()
    expect(t.xhr.send).not.toHaveBeenCalled()
  })
})
