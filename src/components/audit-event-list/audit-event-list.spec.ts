import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElSelect } from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { AuditEvent } from '@/features/audit/audit-adapter'

import AuditEventList from './audit-event-list.vue'

const items: AuditEvent[] = Array.from({ length: 25 }, (_, index) => ({
  action: `audit.action-${index + 1}`,
  actor: '1',
  afterSummary: {},
  beforeSummary: {},
  objectId: `OBJECT-${index + 1}`,
  objectType: 'settings',
  occurredAt: '2026-10-08T13:42:19Z',
  reason: null,
  requestId: `REQUEST-${index + 1}`
}))

describe('AuditEventList', () => {
  it('displays a dash for null, empty and whitespace reasons while preserving real reasons', async () => {
    const wrapper = mount(AuditEventList, {
      props: { items: [null, '', '   ', '人工核对'].map((reason) => ({ ...items[0]!, reason })) },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.findAll('tbody tr').map((row) => row.findAll('td')[4]?.text())).toEqual([
      '-',
      '-',
      '-',
      '人工核对'
    ])
    wrapper.unmount()
  })
  it('shows ten records per page and displays the final partial page after jumping', async () => {
    const wrapper = mount(AuditEventList, { props: { items }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.findAll('.el-table__body tbody tr')).toHaveLength(10)
    expect(wrapper.text()).toContain('共 25 条')
    expect(wrapper.text()).toContain('audit.action-1')
    const jump = wrapper.find('.el-pagination__jump input')
    await jump.setValue('3')
    await jump.trigger('change')
    await jump.trigger('blur')
    expect(wrapper.findAll('.el-table__body tbody tr')).toHaveLength(5)
    expect(wrapper.text()).toContain('audit.action-21')
    expect(wrapper.text()).not.toContain('audit.action-20')
    wrapper.unmount()
  })

  it('returns to page one when the number of records per page changes', async () => {
    const wrapper = mount(AuditEventList, { props: { items }, global: { plugins: [ElementPlus] } })
    await wrapper.find('.el-pagination .btn-next').trigger('click')
    expect(wrapper.text()).toContain('audit.action-11')
    wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 20)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.el-table__body tbody tr')).toHaveLength(20)
    expect(wrapper.text()).toContain('audit.action-1')
    wrapper.unmount()
  })

  it('keeps a valid page when records shrink and renders the empty state', async () => {
    const wrapper = mount(AuditEventList, { props: { items }, global: { plugins: [ElementPlus] } })
    await wrapper.find('.el-pagination .btn-next').trigger('click')
    await wrapper.setProps({ items: items.slice(0, 3) })
    expect(wrapper.findAll('.el-table__body tbody tr')).toHaveLength(3)
    expect(wrapper.text()).toContain('audit.action-1')
    await wrapper.setProps({ items: [] })
    expect(wrapper.text()).toContain('暂无审计事件')
    expect(wrapper.find('[aria-label="列表分页"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
