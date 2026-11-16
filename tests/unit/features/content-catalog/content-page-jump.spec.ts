import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import ContentPageJump from '@/features/content-catalog/content-page-jump.vue'

it('does not navigate on input or blur, rejects invalid input and preserves it, and shares Enter/button submission', async () => {
  const wrapper = mount(ContentPageJump, { props: { page: 1, totalPages: 3 } })
  const input = wrapper.get('input')
  await input.setValue('2e0')
  await input.trigger('blur')
  expect(wrapper.emitted('jump')).toBeUndefined()
  await wrapper.get('form').trigger('submit')
  expect(wrapper.get('[role="alert"]').text()).toContain('整数')
  expect(input.element.value).toBe('2e0')
  await input.setValue(' 003 ')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('jump')).toEqual([[3]])
  await wrapper.setProps({ busy: true })
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('jump')).toHaveLength(1)
  wrapper.unmount()
})
it('disables zero-result jumping without displaying a fictional page', () => {
  const wrapper = mount(ContentPageJump, { props: { page: 1, totalPages: 0 } })
  expect(wrapper.get('input').attributes('disabled')).toBeDefined()
  expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})
