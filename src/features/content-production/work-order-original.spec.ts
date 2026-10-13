import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import WorkOrderOriginal from './work-order-original.vue'
describe('不可变原文面板', () => {
  it('只读快照不引用编辑中的候选', () => {
    const wrapper = mount(WorkOrderOriginal, {
      props: { snapshot: { blocks: [{ text: 'Original English', paragraph_index: 2 }] } },
      global: { plugins: [ElementPlus] }
    })
    expect(wrapper.text()).toContain('Original English')
    expect(wrapper.text()).toContain('第 2 段')
  })
  it('缺失快照明确提示补充，不显示空的伪原文', () => {
    const wrapper = mount(WorkOrderOriginal, {
      props: { snapshot: null },
      global: { plugins: [ElementPlus] }
    })
    expect(wrapper.text()).toContain('未保留可验证的原始正文')
  })
})
