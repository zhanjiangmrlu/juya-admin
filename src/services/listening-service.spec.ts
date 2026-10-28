import { expect, it, vi } from 'vitest'
import { reactive } from 'vue'

const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import { listeningOperation } from './listening-service'

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
