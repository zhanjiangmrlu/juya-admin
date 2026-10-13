import { describe, expect, it, vi } from 'vitest'

import { createWorkOrderAdapter } from './work-order-adapter'
import { findWorkOrderRange, resolveWorkOrderContext } from './work-order-context'
describe('旧入口工作单上下文', () => {
  it('查完无可证明关联返回空值，查询失败保持错误', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockRejectedValueOnce(new Error('查询失败'))
    const adapter = createWorkOrderAdapter({ request })
    expect(await findWorkOrderRange(adapter, 'old')).toBeNull()
    await expect(findWorkOrderRange(adapter, 'old')).rejects.toThrow('查询失败')
  })
  it('旧范围只精确匹配工作单并跨页查找，不能使用第一篇替代', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ work_order_id: 'wrong', publication_token: 'different' }],
        total: 2
      })
      .mockResolvedValueOnce({
        items: [{ work_order_id: 'right', publication_token: 'token' }],
        total: 2
      })
    expect(
      (await findWorkOrderRange(createWorkOrderAdapter({ request }), 'token'))?.work_order_id
    ).toBe('right')
    expect(request.mock.calls[1]?.[0].query.page).toBe(2)
  })
  it('优先复用真实关联，不能用全库回退替代', async () => {
    const request = vi.fn().mockResolvedValue({
      items: [{ content_id: 'content', work_order_id: 'order', work_item_id: 'one' }]
    })
    expect(
      await resolveWorkOrderContext(createWorkOrderAdapter({ request }), {
        content_type: 'dialogue',
        content_id: 'content',
        series_id: 'series'
      })
    ).toEqual({ orderId: 'order', itemId: 'one' })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('无关联时只把这篇既有草稿加入手工工作单', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ work_order_id: 'new' })
      .mockResolvedValueOnce({ items: [{ item_id: 'one' }] })
    expect(
      await resolveWorkOrderContext(
        createWorkOrderAdapter({ request }),
        {
          content_type: 'word_card',
          content_id: 'content',
          series_id: 'series'
        },
        'same-attempt'
      )
    ).toEqual({ orderId: 'new', itemId: 'one' })
    expect(request.mock.calls[1]?.[0].body).toEqual({
      content_type: 'word_card',
      content_id: 'content',
      series_id: 'series'
    })
    expect(request.mock.calls[1]?.[0].headers).toEqual({ 'Idempotency-Key': 'same-attempt' })
  })
})
