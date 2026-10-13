import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { WorkItem, WorkOrder } from './work-order-model'

import WorkOrderOverview from './work-order-overview.vue'

describe('工作单结果视图', () => {
  it('整单计数、生命周期与生产状态分别展示，问题按钮携带真实成员', async () => {
    const order = {
      counts: {
        total: 1000,
        normal: 900,
        review_required: 60,
        failed: 40,
        processing: 0,
        confirmed: 0,
        publishable: 0,
        published: 2,
        cancelled: 0
      },
      series_title: '日常英语',
      content_type: 'dialogue',
      pending_commands: []
    } as unknown as WorkOrder
    const item = {
      item_id: 'one',
      title_en: 'Original title',
      lifecycle_status: 'PUBLISHED',
      production_status: 'review_required',
      issues: [
        {
          id: 'issue',
          message: '译文未配对',
          location: ['dialogue', '1', 'chinese'],
          correction_target: 'source'
        }
      ],
      tasks: []
    } as unknown as WorkItem
    const wrapper = mount(WorkOrderOverview, {
      props: { order, items: [item], busy: false },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('1000')
    expect(wrapper.text()).toContain('900')
    expect(wrapper.text()).toContain('已发布')
    expect(wrapper.text()).toContain('译文未配对')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '对照原文校对')!
      .trigger('click')
    expect(wrapper.emitted('edit')?.[0]).toEqual([item, item.issues![0]])
  })
})
