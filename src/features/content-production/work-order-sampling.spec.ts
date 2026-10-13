import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { ProductionSchema as S } from './work-order-model'

import WorkOrderSampling from './work-order-sampling.vue'
describe('工作单抽样范围', () => {
  it('仅列服务端范围，人工检查未勾选时不能通过，样本数量来自服务端', async () => {
    const state = {
      sample_ids: ['revision'],
      candidates: [
        {
          revision_id: 'revision',
          content_id: 'content',
          content_type: 'short_reading',
          candidate_hash: 'hash',
          normal: true
        }
      ],
      normal_count: 900,
      confirmed_revision_ids: [],
      collection_hash: 'collection'
    } as unknown as S['SamplingState']
    const wrapper = mount(WorkOrderSampling, {
      props: {
        state,
        items: [{ item_id: 'one', revision_id: 'revision', title_en: 'Only member' }],
        busy: false
      },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('900')
    expect(wrapper.text()).toContain('所需样本 1')
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === '确认已检查本篇')
        ?.attributes('disabled')
    ).toBeDefined()
    expect(wrapper.text()).not.toContain('输入集合编号')
  })
  it('异步成员到达后仍加载当前样本', async () => {
    const wrapper = mount(WorkOrderSampling, {
      props: {
        state: {
          sample_ids: ['revision'],
          candidates: [{ revision_id: 'revision' }],
          normal_count: 1,
          confirmed_revision_ids: [],
          collection_hash: 'hash'
        } as unknown as S['SamplingState'],
        items: [],
        busy: false
      },
      global: { plugins: [ElementPlus] }
    })
    await wrapper.setProps({ items: [{ item_id: 'one', revision_id: 'revision' }] })
    await flushPromises()
    expect(wrapper.emitted('inspect')).toEqual([['one']])
  })
})
