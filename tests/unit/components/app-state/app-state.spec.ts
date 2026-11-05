import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import AppState from '@/components/app-state/app-state.vue'

it('keeps the existing state presentation by default', () => {
  const page = mount(AppState, { props: { empty: true, emptyTitle: '暂无用户' } })
  expect(page.get('h3').text()).toBe('暂无用户')
  expect(page.find('.el-empty').exists()).toBe(false)
})

it('offers retry in element mode and never replaces a failed request with empty state', async () => {
  const page = mount(AppState, {
    props: { elementPlus: true, error: '读取失败', empty: true }
  })
  expect(page.get('[role="alert"]').text()).toContain('读取失败')
  expect(page.find('h3').exists()).toBe(false)
  await page.get('button').trigger('click')
  expect(page.emitted('retry')).toHaveLength(1)
})

it('keeps loading ahead of empty state and preserves the custom recovery action', async () => {
  const page = mount(AppState, {
    props: { elementPlus: true, busy: true, empty: true, emptyTitle: '暂无符合条件的用户' },
    slots: { default: '<button>清空条件</button>' }
  })
  expect(page.get('[role="status"]').text()).toBe('正在加载…')
  expect(page.find('h3').exists()).toBe(false)
  await page.setProps({ busy: false })
  expect(page.get('h3').text()).toBe('暂无符合条件的用户')
  expect(page.get('button').text()).toBe('清空条件')
})
