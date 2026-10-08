import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AdminNotice from './admin-notice.vue'

describe('AdminNotice', () => {
  it('renders page-provided instructions as text and preserves its content and class', () => {
    const wrapper = mount(AdminNotice, {
      props: { title: '提交前确认' },
      attrs: { class: 'notice' },
      slots: { default: '<p>核对当前服务端版本。</p>' }
    })
    expect(wrapper.element.tagName).toBe('ASIDE')
    expect(wrapper.find('strong').text()).toBe('提交前确认')
    expect(wrapper.classes()).toContain('notice')
    expect(wrapper.find('p').text()).toBe('核对当前服务端版本。')
    wrapper.unmount()
  })
})
