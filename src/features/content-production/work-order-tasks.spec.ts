import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { ProductionSchema as S, WorkItem, WorkOrder } from './work-order-model'

import WorkOrderTasks from './work-order-tasks.vue'

describe('实际 Token 计量呈现', () => {
  it.each([
    {
      name: '全部缺测',
      meters: [[null, null]],
      input: '未知（1 次调用待核实）',
      output: '未知（1 次调用待核实）'
    },
    {
      name: '部分缺测',
      meters: [
        [12, null],
        [null, 7]
      ],
      input: '已知部分 12（1 次调用待核实）',
      output: '已知部分 7（1 次调用待核实）'
    },
    { name: '已测零值', meters: [[0, 0]], input: '0', output: '0' },
    { name: '没有调用', meters: [], input: '尚无计量记录', output: '尚无计量记录' }
  ])('$name 不把缺测呈现为实测零', ({ meters, input, output }) => {
    const attempts: S['UsageAttempt'][] = meters.map(([inputTokens, outputTokens], index) => ({
      actual_units: null,
      attempt_id: `attempt-${index}`,
      attempt_number: 1,
      created_at: '2026-10-15T00:00:00Z',
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      kind: 'AI_TOKENS',
      measured_audio_ms: null,
      model: 'qwen-flash',
      reserved_units: 100,
      stage_id: 'ai-stage',
      status: 'UNKNOWN',
      list_price_estimate: null,
      provider_region: null
    }))
    const usage: S['WorkOrderUsage'] = {
      work_order_id: 'order',
      attempts,
      provenance: 'associated_stage_records',
      retry_count: 0,
      unknown_count: attempts.length,
      audio_reference_count: 0,
      audio_unknown_count: 0,
      estimation_scope: 'associated_attempts_and_current_planned_candidates',
      known_list_price_subtotal_cny: null,
      measured_audio_ms: null,
      planned: [],
      potential: [],
      source_text_count: 1,
      source_text_utf8_bytes: 100,
      source_unknown_count: 0,
      unpriced_attempt_count: attempts.length
    }
    const wrapper = mount(WorkOrderTasks, {
      props: {
        order: { counts: { total: 1 }, series_title: '计量批次' } as WorkOrder,
        phases: null,
        usage,
        items: [],
        busy: false
      },
      global: { plugins: [ElementPlus], stubs: { teleport: true } }
    })
    const actual = wrapper
      .findAll('p')
      .find((paragraph) => paragraph.text().startsWith('实际调用：'))!
    expect(actual.text()).toContain(`输入 ${input} · 输出 ${output}`)
    expect(wrapper.text()).toContain('公开原价估算与供应商账单不同')
    wrapper.unmount()
  })
})

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
