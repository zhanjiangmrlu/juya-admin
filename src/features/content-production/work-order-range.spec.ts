import { describe, expect, it } from 'vitest'

import type { WorkOrder } from './work-order-model'

import { createWorkOrderAdapter } from './work-order-adapter'
import { readWorkOrderMembers } from './work-order-range'

describe('完整批次范围', () => {
  it('读取1000逻辑篇目，每页最多100并校验整批哈希', async () => {
    const order = { work_order_id: 'one', version: 1, counts: { total: 1000 } } as WorkOrder
    const pages: number[] = []
    const adapter = createWorkOrderAdapter({
      request: async <T>(request: {
        path: string
        query?: Readonly<Record<string, unknown>>
      }): Promise<T> => {
        if (!request.path.endsWith('/items')) return order as T
        const page = Number(request.query?.page)
        pages.push(page)
        return {
          items: Array.from({ length: 100 }, (_, index) => ({
            item_id: `${(page - 1) * 100 + index}`,
            work_order_id: 'one',
            issues: []
          })),
          total: 1000,
          version: 1,
          collection_hash: 'fixed',
          counts: order.counts
        } as T
      }
    })
    const members = await readWorkOrderMembers(adapter, order, () => true)
    expect(members).toHaveLength(1000)
    expect(pages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1])
  })

  it('版本不变但候选已变化时拒绝混合分页范围', async () => {
    const order = { work_order_id: 'one', version: 1, counts: { total: 101 } } as WorkOrder
    const adapter = createWorkOrderAdapter({
      request: async <T>(request: {
        path: string
        query?: Readonly<Record<string, unknown>>
      }): Promise<T> =>
        ({
          items: Array.from({ length: request.query?.page === 1 ? 100 : 1 }, (_, index) => ({
            item_id: `${request.query?.page}-${index}`,
            work_order_id: 'one',
            issues: []
          })),
          total: 101,
          version: 1,
          collection_hash: request.query?.page === 1 ? 'first' : 'changed',
          counts: order.counts
        }) as T
    })
    await expect(readWorkOrderMembers(adapter, order, () => true)).rejects.toThrow('范围已变化')
  })
})
