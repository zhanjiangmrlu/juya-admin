import { describe, expect, it, vi } from 'vitest'

import type { ApiClient } from '@/services/api/api-client'

import { useWorkOrder } from './use-work-order'
import { createWorkOrderAdapter } from './work-order-adapter'

const order = {
  work_order_id: 'order',
  version: 2,
  counts: { total: 1000, normal: 900, failed: 40, review_required: 60 },
  pending_commands: [{ command_id: 'pending', action: 'organize' }]
}
describe('可恢复工作单状态', () => {
  it('切换工作单清除上一批抽样和发布范围', async () => {
    const request = vi.fn(async ({ path }: { path: string }) =>
      path.endsWith('/sampling')
        ? { collection_hash: 'old' }
        : path.endsWith('/publication')
          ? { token: 'old' }
          : path.endsWith('/items')
            ? { items: [] }
            : path.endsWith('/first')
              ? { ...order, proofreading_set_id: 'old', publication_token: 'old' }
              : {
                  ...order,
                  work_order_id: 'second',
                  proofreading_set_id: null,
                  publication_token: null
                }
    )
    const model = useWorkOrder(createWorkOrderAdapter({ request: request as ApiClient['request'] }))
    await model.load('first')
    await model.load('second')
    expect(model.sampling.value).toBeNull()
    expect(model.publication.value).toBeNull()
  })
  it('读取整单权威范围并在命令后重新读取抽样与计数', async () => {
    const requests: string[] = []
    const request = vi.fn(async ({ path }: { path: string }) => {
      requests.push(path)
      return path.endsWith('/items')
        ? { items: [], counts: order.counts, total: 1000 }
        : path.endsWith('/sampling')
          ? { collection_hash: 'fresh' }
          : order
    })
    const model = useWorkOrder(createWorkOrderAdapter({ request: request as ApiClient['request'] }))
    await model.load('order')
    expect(model.order.value?.counts.total).toBe(1000)
    await model.run('sample-actions', {
      operation: 'confirm',
      scope: 'selected',
      selected_item_ids: ['one'],
      candidate_hash: 'current',
      text_checked: true
    })
    expect(model.sampling.value?.collection_hash).toBe('fresh')
    expect(requests.filter((path) => path.endsWith('/order')).length).toBe(2)
  })
  it('冲突后读取权威范围并提示重新核对，不自动重试写入', async () => {
    const request = vi.fn(async ({ method, path }: { method: string; path: string }) => {
      if (method === 'POST') throw new Error('数据状态已变化')
      return path.endsWith('/items') ? { items: [], counts: order.counts, total: 1000 } : order
    })
    const model = useWorkOrder(createWorkOrderAdapter({ request: request as ApiClient['request'] }))
    await model.load('order')
    expect(await model.run('organize', {})).toBe(false)
    expect(model.error.value).toContain('重新核对')
    expect(request.mock.calls.filter(([arg]) => arg.method === 'POST')).toHaveLength(1)
  })
})
