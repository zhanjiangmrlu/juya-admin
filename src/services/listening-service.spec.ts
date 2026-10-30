import { expect, it, vi } from 'vitest'
import { reactive } from 'vue'

const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import { listeningOperation, listeningRecoverableOperation } from './listening-service'

it('freezes Vue-backed order data and reuses its idempotency key on unknown retry', async () => {
  const order = reactive({
    scope: 'topic',
    topic_id: 'topic',
    article_ids: ['a', 'b'],
    revision: 2
  })
  network
    .mockRejectedValueOnce(new Error('disconnected'))
    .mockResolvedValueOnce(Response.json({ revision: 3, article_ids: ['a', 'b'] }))
  const save = listeningOperation('PUT', '/order', order)
  order.article_ids.reverse()
  await expect(save()).rejects.toThrow('网络连接中断')
  await expect(save()).resolves.toMatchObject({ revision: 3 })
  const first = network.mock.calls[0]![0] as Request,
    second = network.mock.calls[1]![0] as Request
  expect(first.url).toBe('https://admin-api.example/api/admin/v1/listening/order')
  expect(first.headers.get('Idempotency-Key')).toBe(second.headers.get('Idempotency-Key'))
  expect(await second.json()).toMatchObject({ article_ids: ['a', 'b'], revision: 2 })
})

it.each([409, 422])(
  'ends unknown state after the original write is explicitly rejected (%s)',
  async (status) => {
    network.mockReset()
    network
      .mockRejectedValueOnce(new Error('lost before commit'))
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'operation_unknown', message: 'No receipt' } },
          { status: 404 }
        )
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'listening_article_changed', message: '编辑稿已变化' } },
          { status }
        )
      )
    const operation = listeningRecoverableOperation('POST', '/articles/a/publish', { revision: 1 })
    await expect(operation.run()).rejects.toThrow('网络连接中断')
    expect(operation.unknown).toBe(true)
    await expect(operation.run()).rejects.toThrow('编辑稿已变化')
    expect(operation.unknown).toBe(false)
    const writes = network.mock.calls
      .map((call) => call[0] as Request)
      .filter((request) => request.method === 'POST')
    expect(writes).toHaveLength(2)
    expect(writes[0]!.headers.get('Idempotency-Key')).toBe(
      writes[1]!.headers.get('Idempotency-Key')
    )
  }
)
it('keeps a failed receipt query unknown and later restores the committed version without another write', async () => {
  network.mockReset()
  network
    .mockRejectedValueOnce(new Error('response lost'))
    .mockRejectedValueOnce(new Error('receipt temporarily unavailable'))
    .mockResolvedValueOnce(Response.json({ result: { published_version_id: 'v1' } }))
  const operation = listeningRecoverableOperation('POST', '/articles/a/publish', { revision: 1 })
  await expect(operation.run()).rejects.toThrow('网络连接中断')
  await expect(operation.run()).rejects.toThrow('网络连接中断')
  expect(operation.unknown).toBe(true)
  await expect(operation.run()).resolves.toEqual({ published_version_id: 'v1' })
  expect(operation.unknown).toBe(false)
  expect(
    network.mock.calls
      .map((call) => call[0] as Request)
      .filter((request) => request.method === 'POST')
  ).toHaveLength(1)
})
