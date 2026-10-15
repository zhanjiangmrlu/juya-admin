import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it, vi } from 'vitest'

import type { ProductionSchema as S } from './work-order-model'

import WorkOrderSourceIssues from './work-order-source-issues.vue'

const issue = {
  id: 'source-one',
  code: 'SOURCE_TEXT_CONFLICT',
  message: '来源原句与指定正文位置不一致',
  severity: 'WARNING',
  correction_target: 'source',
  location: ['source_locator'],
  source_diagnostic: {
    entry_text: 'latte',
    entry_type: 'word',
    source_locations: ['原始词条表 · 第 4 行'],
    declared_locator: 1,
    declared_text: 'A cup of tea.',
    actual_text: 'A cup of coffee.',
    actual_sentence_number: 1,
    actual_sentence_id: 'sentence-one',
    declared_speaker: 'A',
    actual_speaker: 'B',
    unsupported_fields: [],
    matched_sentence_numbers: []
  }
} as unknown as S['WorkIssue']

describe('来源问题诊断', () => {
  it('同类问题按数量分组，每个词条保留冲突双方与处理方式，文本安全转义', async () => {
    const wrapper = mount(WorkOrderSourceIssues, {
      props: {
        issues: [
          issue,
          {
            ...issue,
            id: 'source-one',
            source_diagnostic: { ...issue.source_diagnostic, entry_text: '<img src=x>' }
          }
        ]
      },
      global: { plugins: [ElementPlus] }
    })
    expect(wrapper.text()).toContain('2 项问题')
    expect(wrapper.findAll('.source-issue')).toHaveLength(2)
    expect(wrapper.text()).toContain('词汇「latte」')
    expect(wrapper.text()).toContain('词表填写的来源原句')
    expect(wrapper.text()).toContain('指定的正文第 1 句')
    expect(wrapper.text()).toContain('原始词条表 · 第 4 行')
    expect(wrapper.text()).toContain('重新导入')
    expect(wrapper.findAll('mark').map((mark) => mark.text())).toContain('tea')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('词汇「<img src=x>」')
  })
  it('旧问题明确说明缺少诊断，不猜词条且不提供无目标的定位按钮', () => {
    const wrapper = mount(WorkOrderSourceIssues, {
      props: { issues: [{ ...issue, source_diagnostic: null }] },
      global: { plugins: [ElementPlus] }
    })
    expect(wrapper.text()).toContain('旧记录缺少详细定位，请修正源文件后重新导入查看完整诊断')
    expect(wrapper.find('button').exists()).toBe(false)
  })
  it('字段错误显示具体字段与合法格式，单个精确匹配不提示原句重复', () => {
    const wrapper = mount(WorkOrderSourceIssues, {
      props: {
        issues: [
          {
            ...issue,
            code: 'SOURCE_LOCATOR_INVALID',
            source_diagnostic: {
              ...issue.source_diagnostic,
              unsupported_fields: ['turn_index'],
              matched_sentence_numbers: [1]
            }
          }
        ]
      },
      global: { plugins: [ElementPlus] }
    })
    expect(wrapper.text()).toContain('不支持的字段：turn_index')
    expect(wrapper.text()).toContain('sentence_number')
    expect(wrapper.text()).not.toContain('相同原句出现在正文')
  })
  it('原句重复时展示所有真实匹配位置', () => {
    const wrapper = mount(WorkOrderSourceIssues, {
      props: {
        issues: [
          {
            ...issue,
            code: 'SOURCE_AMBIGUOUS',
            source_diagnostic: { ...issue.source_diagnostic, matched_sentence_numbers: [1, 3] }
          }
        ]
      },
      global: { plugins: [ElementPlus] }
    })
    expect(wrapper.text()).toContain('相同原句出现在正文第 1、3 句')
  })
  it('只导航到当前页面中可靠存在的位置并突出目标', async () => {
    const host = document.createElement('section')
    host.setAttribute('data-source-scope', '')
    const target = document.createElement('p')
    target.dataset.sourceSentence = '1'
    target.scrollIntoView = vi.fn()
    host.append(target)
    document.body.append(host)
    const wrapper = mount(WorkOrderSourceIssues, {
      attachTo: host,
      props: { issues: [issue], sentences: [{ id: 'sentence-one', english: 'A cup of coffee.' }] },
      global: { plugins: [ElementPlus] }
    })
    await wrapper.get('button').trigger('click')
    expect(target.scrollIntoView).toHaveBeenCalled()
    expect(target.getAttribute('data-source-highlight')).toBe('true')
    wrapper.unmount()
    host.remove()
  })
})
