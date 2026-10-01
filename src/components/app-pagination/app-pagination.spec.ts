import { mount } from '@vue/test-utils'
import { ElSelect } from 'element-plus'
import { describe, expect, it } from 'vitest'
import { defineComponent, ref } from 'vue'

import AppPagination from './app-pagination.vue'

describe('AppPagination', () => {
  it('renders Chinese controls even for a single or empty page', () => {
    for (const total of [0, 7]) {
      const wrapper = mount(AppPagination, { props: { total } })
      expect(wrapper.text()).toContain(`共 ${total} 条`)
      expect(wrapper.text()).toContain('前往')
      expect(wrapper.findComponent(ElSelect).props('modelValue')).toBe(10)
      wrapper.unmount()
    }
  })

  it('resets to page one and emits one query when the page size changes', async () => {
    const wrapper = mount(
      defineComponent({
        components: { AppPagination },
        setup: () => ({ page: ref(5), size: ref(10) }),
        template:
          '<AppPagination v-model:current-page="page" v-model:page-size="size" :total="120" />'
      })
    )
    const pagination = wrapper.findComponent(AppPagination)
    pagination.findComponent(ElSelect).vm.$emit('update:modelValue', 50)
    await wrapper.vm.$nextTick()
    expect(pagination.props('currentPage')).toBe(1)
    expect(pagination.props('pageSize')).toBe(50)
    expect(pagination.emitted('change')).toEqual([[1, 50]])
    wrapper.unmount()
  })

  it('jumps to a typed page without requiring a total and disables next on a short page', async () => {
    const wrapper = mount(AppPagination, { props: { currentPage: 2 } })
    const input = wrapper.find('input[role="spinbutton"]')
    await input.setValue('8')
    await input.trigger('change')
    await input.trigger('keyup', { key: 'Enter' })
    expect(wrapper.emitted('change')).toEqual([[8, 10]])
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === '下一页')
        ?.attributes('disabled')
    ).toBeDefined()
    wrapper.unmount()
  })
})
