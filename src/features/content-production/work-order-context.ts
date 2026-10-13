import type { createWorkOrderAdapter } from './work-order-adapter'
import type { ProductionSchema as S } from './work-order-model'
export const /** 精确恢复旧发布范围所属工作单
   * @param adapter - 已认证工作单读取接口
   * @param token - 旧链接中的持久发布范围
   * @returns 唯一匹配工作单或未关联
   */ findWorkOrderRange = async (
    adapter: ReturnType<typeof createWorkOrderAdapter>,
    token: string
  ): Promise<S['WorkOrder'] | null> => {
    let consumed = 0
    for (let page = 1; ; page++) {
      const result = await adapter.list(page, 100)
      const found = result.items.find((order) => order.publication_token === token)
      if (found) return found
      consumed += result.items.length
      if (!result.items.length || consumed >= result.total) return null
    }
  }
export const /** 恢复旧内容入口的真实工作单
   * @param adapter - 已认证工作单适配器
   * @param content - 已确认类型分类和草稿的单篇内容
   * @param key - 新建草稿遇到不确定结果时复用的幂等键
   * @returns 可进入的工作单和成员
   */
  resolveWorkOrderContext = async (
    adapter: ReturnType<typeof createWorkOrderAdapter>,
    content: S['ManualRequest'],
    key?: string
  ): Promise<{ orderId: string; itemId: string }> => {
    if (content.content_id) {
      const result = await adapter.contexts({
        content_type: content.content_type,
        content_ids: [content.content_id]
      })
      const existing = result.items.find((row) => row.content_id === content.content_id)
      if (existing) return { orderId: existing.work_order_id, itemId: existing.work_item_id }
    }
    const order = await adapter.manual(content, key)
    const members = await adapter.items(order.work_order_id)
    const item = members.items[0]
    if (!item) throw new Error('工作单尚未生成篇目，请刷新工作单列表')
    return { orderId: order.work_order_id, itemId: item.item_id }
  }
