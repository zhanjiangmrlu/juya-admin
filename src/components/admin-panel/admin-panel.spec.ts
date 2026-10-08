import { mount } from '@vue/test-utils'
import { ElCard } from 'element-plus'
import { describe, expect, it } from 'vitest'

import AdminPanel from './admin-panel.vue'

describe('AdminPanel', () => {
  it('renders configured heading, description and card attributes', () => {
    const wrapper = mount(AdminPanel, {
      props: {
        title: '发布检查',
        heading: 2,
        description: '检查真实草稿',
        bodyStyle: { padding: '12px' }
      },
      attrs: { class: 'validation-panel' },
      slots: { default: '<button>检查</button>' }
    })
    expect(wrapper.find('h2').text()).toBe('发布检查')
    expect(wrapper.text()).toContain('检查真实草稿')
    expect(wrapper.classes()).toContain('validation-panel')
    expect(wrapper.findComponent(ElCard).props('bodyStyle')).toEqual({ padding: '12px' })
    expect(wrapper.findComponent(ElCard).props('shadow')).toBe('never')
    wrapper.unmount()
  })

  it('preserves custom headers, footer and page-owned actions without an empty header', async () => {
    const wrapper = mount(AdminPanel, {
      props: { title: '默认标题' },
      slots: { header: '<h3>业务标题</h3>', footer: '<button>保存</button>' }
    })
    expect(wrapper.findAll('h3')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('默认标题')
    expect(wrapper.find('.el-card__footer').text()).toBe('保存')
    await wrapper.setProps({ title: undefined })
    wrapper.unmount()
    const plain = mount(AdminPanel, { slots: { default: '内容' } })
    expect(plain.find('.el-card__header').exists()).toBe(false)
    plain.unmount()
  })
})
