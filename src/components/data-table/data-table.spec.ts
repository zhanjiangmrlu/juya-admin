import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import DataTable from './data-table.vue'

describe('DataTable configured columns', () => {
  it('supports fields, named business cells, fixed actions, hidden columns and native events', async () => {
    const rows = [{ id: 'u1', name: '小芽', secret: '隐藏资料' }]
    const onSortChange = vi.fn()
    const renderCell = vi.fn(({ row }: { row: object; $index: number }) =>
      h('button', `查看 ${Reflect.get(row, 'id')}`)
    )
    const wrapper = mount(DataTable, {
      props: {
        rows,
        columns: [
          { key: 'name', prop: 'name', label: '用户', minWidth: 180 },
          { key: 'secret', prop: 'secret', label: '内部资料', hidden: true },
          { key: 'actions', label: '操作', width: 90, fixed: 'right', slot: 'actions' }
        ]
      },
      attrs: { stripe: true, 'aria-label': '用户表格', onSortChange },
      slots: { actions: renderCell },
      global: { plugins: [ElementPlus] }
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('el-table')
    const table = wrapper.findComponent({ name: 'ElTable' })
    expect(table.props('stripe')).toBe(true)
    const columns = wrapper.findAllComponents({ name: 'ElTableColumn' })
    expect(columns.map((column) => column.props('label'))).toEqual(['用户', '操作'])
    expect(columns[1]?.props('fixed')).toBe('right')
    await vi.waitFor(() => expect(wrapper.text()).toContain('查看 u1'))
    expect(renderCell.mock.calls.every(([scope]) => scope.$index !== -1)).toBe(true)
    expect(wrapper.text()).not.toContain('隐藏资料')
    table.vm.$emit('sort-change', { prop: 'name', order: 'ascending' })
    expect(onSortChange).toHaveBeenCalledExactlyOnceWith({ prop: 'name', order: 'ascending' })
    wrapper.unmount()
  })

  it('keeps existing column slots and uses Element Plus empty state for an empty list', () => {
    const wrapper = mount(DataTable, {
      props: { rows: [], emptyText: '没有匹配用户' },
      slots: { default: '<ElTableColumn label="原有列" prop="id" />' },
      global: { plugins: [ElementPlus] }
    })
    expect(wrapper.text()).toContain('没有匹配用户')
    expect(wrapper.findComponent({ name: 'ElTableColumn' }).props('label')).toBe('原有列')
    wrapper.unmount()
  })
})
