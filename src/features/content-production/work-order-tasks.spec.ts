import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { ProductionSchema as S, WorkItem, WorkOrder } from './work-order-model'

import WorkOrderTasks from './work-order-tasks.vue'

describe('权威失败阶段范围', () => {
  it('真实FAILED付费未知只待人工核实，可续办原回执但不能重试提交', async () => {
    const wrapper = mount(WorkOrderTasks, {
      props: {
        order: {
          counts: { total: 1 },
          pending_commands: [{ command_id: 'original-receipt', retry_at: '2026-01-01T00:00:00Z' }]
        } as WorkOrder,
        phases: {
          phases: [
            {
              key: 'matching',
              label: '素材与词库匹配',
              counts: { total: 1, unknown: 1 },
              retryable: []
            }
          ]
        } as unknown as S['WorkOrderPhases'],
        usage: null,
        items: [
          {
            item_id: 'unknown',
            title_en: 'Paid uncertainty',
            tasks: [
              {
                stage_id: 'paid',
                stage: 'AI_LEXICON',
                current: true,
                status: 'FAILED',
                error_code: 'PROVIDER_OUTCOME_UNKNOWN',
                retryable: true
              }
            ]
          }
        ] as unknown as WorkItem[],
        busy: false
      },
      global: { plugins: [ElementPlus], stubs: { teleport: true } }
    })
    wrapper.vm.failedOpened = true
    await flushPromises()
    expect(wrapper.text()).toContain('付费调用结果待人工核实，不可重新提交')
    expect(wrapper.text()).not.toContain('仅重试此失败阶段')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '继续核实结果')!
      .trigger('click')
    expect(wrapper.emitted('resume')?.[0]).toEqual(['original-receipt'])
    expect(wrapper.emitted('retry')).toBeUndefined()
  })
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
