import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import AuditTimeline from './audit-timeline.vue'

describe('audit timeline', () => {
  it('renders supplied audit items and an explicit pending state when empty', () => {
    const populated = mount(AuditTimeline, {
      global: { plugins: [ElementPlus] },
      props: { items: [{ actor: '管理员', at: '2026-09-29 12:00', content: '开始处理', id: '1' }] }
    })
    expect(populated.text()).toContain('开始处理')
    expect(populated.text()).toContain('管理员')

    const empty = mount(AuditTimeline, { global: { plugins: [ElementPlus] }, props: { items: [] } })
    expect(empty.text()).toContain('时间线接口待接入')
  })
})
