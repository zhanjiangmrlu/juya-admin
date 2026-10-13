import { ref, shallowRef } from 'vue'

import type { createWorkOrderAdapter } from './work-order-adapter'
import type { ProductionSchema as S } from './work-order-model'

type ActionFields = Omit<
  Parameters<ReturnType<typeof createWorkOrderAdapter>['command']>[2],
  'expected_version'
> & { [key: string]: unknown }

export const /** 管理工作单权威范围与恢复
   * @param adapter - 工作单接口
   * @returns 响应状态与操作
   */
  useWorkOrder = (adapter: ReturnType<typeof createWorkOrderAdapter>) => {
    const order = shallowRef<S['WorkOrder'] | null>(null)
    const items = shallowRef<S['ItemPage'] | null>(null)
    const sampling = shallowRef<S['SamplingState'] | null>(null)
    const publication = shallowRef<S['PublicationState'] | null>(null)
    const busy = ref(false)
    const error = ref('')
    const page = ref(1)
    const pageSize = ref(20)
    const status = ref('')
    let sequence = 0
    const /** 从服务端恢复工作单及当前页
       * @param id - 地址中持久化的工作单
       * @returns 加载是否成功
       */
      load = async (id: string): Promise<boolean> => {
        const generation = ++sequence
        if (order.value?.work_order_id !== id) {
          order.value = null
          items.value = null
          sampling.value = null
          publication.value = null
        }
        try {
          const [current, rows] = await Promise.all([
            adapter.get(id),
            adapter.items(id, page.value, pageSize.value, status.value)
          ])
          if (generation !== sequence) return false
          order.value = current
          items.value = rows
          const [sample, published] = await Promise.all([
            current.proofreading_set_id ? adapter.sampling(id) : null,
            current.publication_token ? adapter.publication(id) : null
          ])
          if (generation !== sequence) return false
          sampling.value = sample
          publication.value = published
          return true
        } catch (failure) {
          if (generation === sequence)
            error.value = failure instanceof Error ? failure.message : '工作单加载失败，请刷新'
          return false
        }
      }
    const /** 提交当前范围命令，成功和冲突都重读权威状态
       * @param action - 管理员选择的业务操作
       * @param fields - 明确的范围和人工确认
       * @returns 命令是否被服务接受
       */
      run = async (action: string, fields: ActionFields = {}): Promise<boolean> => {
        if (!order.value || busy.value) return false
        busy.value = true
        error.value = ''
        const id = order.value.work_order_id
        try {
          await adapter.command(id, action, { ...fields, expected_version: order.value.version })
          await load(id)
          if (action === 'sampling' || action === 'sample-actions')
            sampling.value = await adapter.sampling(id)
          if (action.startsWith('publication-')) publication.value = await adapter.publication(id)
          return true
        } catch (failure) {
          await load(id)
          error.value = `${failure instanceof Error ? failure.message : '操作结果待核实'}。已刷新当前范围，请重新核对后操作；挂起操作可在任务记录中续办`
          return false
        } finally {
          busy.value = false
        }
      }
    const /** 恢复服务端挂起回执，不创建第二份范围
       * @param commandId - 服务端提供的待恢复命令
       */
      resume = async (commandId: string): Promise<void> => {
        if (!order.value || busy.value) return
        busy.value = true
        try {
          await adapter.resume(order.value.work_order_id, commandId)
          await load(order.value.work_order_id)
        } catch (failure) {
          error.value = failure instanceof Error ? failure.message : '暂不能续办，请稍后刷新'
        } finally {
          busy.value = false
        }
      }
    return {
      order,
      items,
      sampling,
      publication,
      busy,
      error,
      page,
      pageSize,
      status,
      load,
      run,
      resume
    }
  }
