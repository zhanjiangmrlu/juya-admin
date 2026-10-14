import type { createWorkOrderAdapter } from './work-order-adapter'
import type { WorkItem, WorkOrder } from './work-order-model'

export const /** 读取并核验本批完整成员
   * @param adapter - 已认证的工作单接口
   * @param order - 固定的真实工作单版本和整批计数
   * @param current - 路由和请求代次是否仍有效
   * @returns 当前完整成员或已失效读取
   */ readWorkOrderMembers = async (
    adapter: ReturnType<typeof createWorkOrderAdapter>,
    order: WorkOrder,
    current: () => boolean
  ): Promise<WorkItem[] | null> => {
    const first = await adapter.items(order.work_order_id, 1, 100)
    if (!current()) return null
    const hash = first.collection_hash
    const members = [...first.items]
    const /** 核对分页响应仍属于同一完整候选范围
       * @param result - 当前成员分页响应
       */ validate = (result: typeof first): void => {
        if (
          !hash ||
          result.collection_hash !== hash ||
          result.version !== order.version ||
          result.total !== first.total ||
          Object.entries(first.counts).some(
            ([key, value]) => result.counts[key as keyof typeof result.counts] !== value
          ) ||
          Object.entries(order.counts).some(
            ([key, value]) => result.counts[key as keyof typeof result.counts] !== value
          )
        )
          throw new Error('成员范围已变化，请刷新权威状态')
      }
    validate(first)
    for (let next = 2; members.length < first.total; next++) {
      const more = await adapter.items(order.work_order_id, next, 100)
      if (!current()) return null
      validate(more)
      if (!more.items.length) throw new Error('成员范围读取不完整，请刷新权威状态并重新预览')
      members.push(...more.items)
    }
    if (
      members.length !== first.total ||
      first.total !== order.counts.total ||
      new Set(members.map((row) => row.item_id)).size !== first.total ||
      members.some((row) => row.work_order_id !== order.work_order_id)
    )
      throw new Error('成员范围读取不完整，请刷新权威状态并重新预览')
    const final = await adapter.items(order.work_order_id, 1, 100)
    if (!current()) return null
    validate(final)
    return members
  }
