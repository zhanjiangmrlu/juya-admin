import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import SensitiveValue from './sensitive-value.vue'

describe('SensitiveValue', () => {
  it('shows the complete value in readable text and emits an audited copy request', async () => {
    const wrapper = mount(SensitiveValue, {
      global: { plugins: [ElementPlus] },
      props: { canCopy: true, value: 'wx_complete_123' }
    })

    expect(wrapper.text()).toContain('wx_complete_123')
    expect(wrapper.find('code').exists()).toBe(false)

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('copy')).toHaveLength(1)
  })
})
