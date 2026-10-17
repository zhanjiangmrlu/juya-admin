import { describe, expect, it } from 'vitest'

import { ApiError, createHttpClient } from './http-client'

describe('independent admin credentials', () => {
  it('recovers CSRF from a cookie session and never uses a mini token', async () => {
    const requests: Request[] = []
    const client = createHttpClient('https://admin-api.example', async (request) => {
      requests.push(request as Request)
      return Response.json(
        requests.length === 1
          ? { id: 'admin', username: 'admin', csrf_token: 'csrf-1' }
          : { logged_out: true }
      )
    })
    await client.resume()
    await client.request('/api/admin/v1/auth/logout', { method: 'POST' })
    expect(requests[1]?.credentials).toBe('include')
    expect(requests[1]?.headers.get('X-CSRF-Token')).toBe('csrf-1')
    expect(requests[1]?.headers.get('Authorization')).toBeNull()
    expect(requests[1]?.headers.get('Idempotency-Key')).toBeTruthy()
  })
  it('retains one operation key after a lost write response', async () => {
    const keys: (string | null)[] = []
    const client = createHttpClient('https://admin-api.example', async (request) => {
      keys.push((request as Request).headers.get('Idempotency-Key'))
      if (keys.length === 1) throw new TypeError('network lost')
      return Response.json({ id: 'saved-card' })
    })
    const operation = client.operation('PUT', '/api/admin/v1/cards/card-1', {
      revision: 1,
      content: { name: 'Coffee' }
    })
    await expect(operation()).rejects.toBeInstanceOf(ApiError)
    await operation()
    expect(keys[0]).toEqual(keys[1])
    expect(keys[0]).toBeTruthy()
  })
  it('clears session and reports expiry without inventing empty data', async () => {
    let expired = false
    const client = createHttpClient(
      'https://admin-api.example',
      async () =>
        Response.json(
          { error: { code: 'unauthenticated', message: '请重新登录' } },
          { status: 401 }
        ),
      () => {
        expired = true
      }
    )
    await expect(client.request('/api/admin/v1/users')).rejects.toMatchObject({
      code: 'unauthenticated'
    })
    expect(expired).toBe(true)
  })
})

it('reports upload bytes, uses CSRF, and keeps the same key for an upload retry', async () => {
  const sent: Record<string, string> = {}
  const progress: number[] = []
  const xhr = {
    upload: {
      onprogress: null as
        ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null
    },
    open: () => {},
    setRequestHeader: (key: string, value: string) => {
      sent[key] = value
    },
    withCredentials: false,
    status: 201,
    responseText: '{"id":"image-1","state":"ready"}',
    onload: null as (() => void) | null,
    onerror: null,
    send: () => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
      xhr.onload?.()
    }
  }
  const client = createHttpClient(
    'https://admin-api.example',
    async () => Response.json({ id: 'admin', username: 'admin', csrf_token: 'csrf-upload' }),
    () => {},
    () => xhr as unknown as XMLHttpRequest
  )
  await client.resume()
  const result = await client.upload(
    '/api/admin/v1/media?kind=image',
    new FormData(),
    'fixed-upload-operation',
    (value) => progress.push(value)
  )
  expect(result).toEqual({ id: 'image-1', state: 'ready' })
  expect(sent['X-CSRF-Token']).toBe('csrf-upload')
  expect(sent['Idempotency-Key']).toBe('fixed-upload-operation')
  expect(xhr.withCredentials).toBe(true)
  expect(progress).toEqual([50])
})

it('treats a truncated success response as unknown instead of inventing saved data', async () => {
  const client = createHttpClient(
    'https://admin-api.example',
    async () => new Response('{"id":', { status: 200 })
  )
  await expect(
    client.request('/api/admin/v1/cards', { method: 'POST', body: { content: { name: 'Coffee' } } })
  ).rejects.toMatchObject({ code: 'response_unknown' })
})

it('cancels upload transport while retaining the same key to recover a possibly accepted file', async () => {
  const headers: Record<string, string>[] = []
  const sockets: { onabort?: () => void; onload?: () => void; abort: () => void }[] = []
  const client = createHttpClient(
    'https://admin-api.example',
    fetch,
    () => {},
    () => {
      const sent: Record<string, string> = {}
      headers.push(sent)
      const xhr = {
        upload: {},
        open: () => {},
        setRequestHeader: (key: string, value: string) => {
          sent[key] = value
        },
        send: () => {},
        abort: () => {
          xhr.onabort?.()
        },
        onabort: undefined as (() => void) | undefined,
        onload: undefined as (() => void) | undefined,
        status: 201,
        responseText: '{"id":"accepted"}'
      }
      sockets.push(xhr)
      return xhr as unknown as XMLHttpRequest
    }
  )
  const controller = new AbortController()
  const pending = client.upload(
    '/api/admin/v1/imports/batch/files?kind=docx',
    new FormData(),
    'same-upload-key',
    () => {},
    controller.signal
  )
  controller.abort()
  await expect(pending).rejects.toMatchObject({ code: 'upload_unknown' })
  const retried = client.upload(
    '/api/admin/v1/imports/batch/files?kind=docx',
    new FormData(),
    'same-upload-key',
    () => {}
  )
  sockets[1]!.onload?.()
  await expect(retried).resolves.toEqual({ id: 'accepted' })
  expect(headers.map((item) => item['Idempotency-Key'])).toEqual([
    'same-upload-key',
    'same-upload-key'
  ])
})
