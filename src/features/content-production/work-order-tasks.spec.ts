import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { ProductionSchema as S, WorkItem, WorkOrder } from './work-order-model'

import WorkOrderTasks from './work-order-tasks.vue'

describe('权威失败阶段范围', () => {
  it('共享失败stage不能把持久成功成员列为可重试失败', async () => {
    const task = {
      stage_id: 'shared',
      stage: 'PUBLICATION_RANGE_fixture',
      current: true,
      status: 'FAILED',
      retryable: true
    }
    const items = [
      { item_id: 'done', title_en: 'Saved success', tasks: [task] },
      { item_id: 'failed', title_en: 'Frozen failure', tasks: [task] }
    ] as unknown as WorkItem[]
    const phases = {
      phases: [
        {
          key: 'publication',
          label: '校对与发布',
          counts: { total: 2, succeeded: 1, failed: 1 },
          retryable: [{ item_id: 'failed', stage_id: 'shared' }]
        }
      ]
    } as unknown as S['WorkOrderPhases']
    const wrapper = mount(WorkOrderTasks, {
      props: {
        order: { counts: { total: 2 } } as WorkOrder,
        phases,
        usage: null,
        items,
        busy: false
      },
      global: { plugins: [ElementPlus], stubs: { teleport: true } }
    })
    wrapper.vm.failedOpened = true
    await flushPromises()
    expect(wrapper.text()).toContain('Frozen failure')
    expect(wrapper.text()).not.toContain('Saved success')
  })
})
