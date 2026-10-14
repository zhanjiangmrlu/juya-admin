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
  it('迟到的原发布结果不能覆盖新工作单，刷新失败保留已知成功且不重发', async () => {
    let release!: (result: unknown) => void
    const late = new Promise((resolve) => {
      release = resolve
    })
    let entered!: () => void
    const publicationEntered = new Promise<void>((resolve) => {
      entered = resolve
    })
    let failRead = false
    const writes: string[] = []
    const request = async ({ method, path }: { method: string; path: string }) => {
      if (method === 'POST') {
        writes.push(path)
        return {}
      }
      if (path.endsWith('/items')) return { items: [] }
      if (path.endsWith('/A/publication')) {
        entered()
        return late
      }
      if (path.endsWith('/B/publication')) {
        if (failRead) throw new Error('原结果暂不可读取')
        return {
          work_order_id: 'B',
          token: 'B-token',
          status: 'PARTIAL',
          candidates: [],
          results: [{ revision_id: 'B-ok', status: 'SUCCEEDED' }]
        }
      }
      const id = path.endsWith('/A') ? 'A' : 'B'
      return { ...order, work_order_id: id, publication_token: `${id}-token` }
    }
    const model = useWorkOrder(createWorkOrderAdapter({ request: request as ApiClient['request'] }))
    const readingA = model.load('A')
    await publicationEntered
    await model.load('B')
    release({
      work_order_id: 'A',
      token: 'A-token',
      status: 'SUCCEEDED',
      results: [{ revision_id: 'A-ok', status: 'SUCCEEDED' }]
    })
    await readingA
    expect(model.publication.value?.token).toBe('B-token')
    failRead = true
    expect(await model.load('B')).toBe(false)
    expect(model.publication.value?.results).toEqual([{ revision_id: 'B-ok', status: 'SUCCEEDED' }])
    expect(model.error.value).toContain('原结果暂不可读取')
    expect(writes).toEqual([])
  })
  it('离开页面后恢复命令和读取不再写回，当前刷新不遗留忙碌状态', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const request = vi.fn(async ({ method, path }: { method: string; path: string }) => {
      if (method === 'POST') {
        await pending
        return {}
      }
      return path.endsWith('/items') ? { items: [] } : order
    })
    const model = useWorkOrder(createWorkOrderAdapter({ request: request as ApiClient['request'] }))
    await model.load('order')
    const running = model.run('organize', {})
    await model.load('order')
    finish()
    await running
    expect(model.busy.value).toBe(false)
    const resume = model.resume('pending')
    model.invalidate()
    await resume
    expect(model.order.value).toBeNull()
    expect(model.busy.value).toBe(false)
  })
  it('A 命令延迟完成不能覆盖新 B 工作单', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const request = vi.fn(async ({ method, path }: { method: string; path: string }) => {
      if (method === 'POST') {
        await pending
        return {}
      }
      return path.endsWith('/items')
        ? { items: [] }
        : { ...order, work_order_id: path.endsWith('/B') ? 'B' : 'A' }
    })
    const model = useWorkOrder(createWorkOrderAdapter({ request: request as ApiClient['request'] }))
    await model.load('A')
    const running = model.run('organize', {})
    await model.load('B')
    finish()
    await running
    expect(model.order.value?.work_order_id).toBe('B')
  })
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
