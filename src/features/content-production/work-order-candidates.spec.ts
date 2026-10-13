import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElSelect } from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { CandidateGroup, WorkItemDetail } from './work-order-model'

import WorkOrderCandidates from './work-order-candidates.vue'

describe('逐结果候选决定', () => {
  it('新增中央义项需要明确动作，保留本篇上传释义', async () => {
    const group = {
      candidate_id: 'group',
      item_id: 'one',
      kind: 'PROVIDED_LEXICON',
      status: 'READY',
      results: [
        { result_id: 'row', status: 'PENDING', provided: { english: 'coffee', chinese: '咖啡' } }
      ]
    } as unknown as CandidateGroup
    const wrapper = mount(WorkOrderCandidates, {
      props: { groups: [group], busy: false },
      global: { plugins: [ElementPlus] }
    })
    const button = wrapper
      .findAll('button')
      .find((row) => row.text() === '将本篇释义新增为中央义项')
    expect(button).toBeDefined()
    await button!.trigger('click')
    expect(wrapper.emitted('decide')?.[0]).toEqual([
      group,
      [{ result_id: 'row', decision: 'KEEP_PROVIDED', central_action: 'new_sense' }]
    ])
  })
  it('把同词同类型同义项跨篇归组，显示真实受影响篇目', async () => {
    const wrapper = mount(WorkOrderCandidates, {
      props: {
        busy: false,
        groups: ['one', 'two'].map((id) => ({
          candidate_id: id,
          item_id: id,
          kind: 'PROVIDED_LEXICON',
          status: 'READY',
          results: [
            {
              result_id: id,
              status: 'PENDING',
              provided: { english: ' Coffee ', chinese: '咖啡', entry_type: 'VOCABULARY' }
            }
          ]
        })) as unknown as CandidateGroup[]
      },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('受影响 2 篇')
    expect(wrapper.text()).toContain('按英文、类型与当前含义归组')
  })
  it('需定位的推荐由管理员选择原句中真实出现位置后才能采纳', async () => {
    const group = {
      candidate_id: 'group',
      item_id: 'one',
      kind: 'AI_LEXICON',
      status: 'READY',
      stale: false,
      results: [
        {
          result_id: 'locate',
          status: 'PENDING',
          english: 'coffee',
          chinese: '咖啡',
          source_id: 'sentence',
          requires_manual_correction: true
        }
      ],
      expected_edit_version: 4
    } as unknown as CandidateGroup
    const wrapper = mount(WorkOrderCandidates, {
      props: {
        groups: [group],
        busy: false,
        details: [
          {
            item_id: 'one',
            current: {
              template: 'dialogue',
              content: { dialogue: [{ id: 'sentence', english: 'Coffee and coffee.' }] }
            }
          }
        ] as unknown as WorkItemDetail[]
      },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    const position = wrapper
      .findAllComponents(ElSelect)
      .find((row) => row.props('ariaLabel') === '原文位置')
    expect(position).toBeDefined()
    position!.vm.$emit('update:modelValue', 11)
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '采纳本条')!
      .trigger('click')
    expect(wrapper.emitted('decide')?.[0]).toEqual([
      group,
      [
        {
          result_id: 'locate',
          decision: 'ADOPTED',
          entry_type: 'VOCABULARY',
          source_id: 'sentence',
          start: 11,
          end: 17
        }
      ]
    ])
  })
  it('UNKNOWN 可主动放弃，同时保留真实供应商状态', async () => {
    const group = {
      candidate_id: 'group',
      item_id: 'one',
      kind: 'AI_LEXICON',
      status: 'UNKNOWN',
      stale: true,
      results: [],
      expected_edit_version: 3
    } as unknown as CandidateGroup
    const wrapper = mount(WorkOrderCandidates, {
      props: { groups: [group], busy: false },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('结果待核实')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '放弃本次推荐')!
      .trigger('click')
    expect(wrapper.emitted('dismiss')?.[0]).toEqual([group])
  })
  it('同组已有决定保持结束，待处理结果可以独立拒绝', async () => {
    const group = {
      candidate_id: 'group',
      item_id: 'one',
      kind: 'AI_LEXICON',
      status: 'READY',
      stale: false,
      results: [
        { result_id: 'done', status: 'ADOPTED', english: 'first' },
        { result_id: 'next', status: 'PENDING', english: 'second' }
      ],
      expected_edit_version: 4
    } as unknown as CandidateGroup
    const wrapper = mount(WorkOrderCandidates, {
      props: { groups: [group], busy: false },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '拒绝本条')!
      .trigger('click')
    expect(wrapper.emitted('decide')?.[0]).toEqual([
      group,
      [{ result_id: 'next', decision: 'REJECTED' }]
    ])
  })
})
