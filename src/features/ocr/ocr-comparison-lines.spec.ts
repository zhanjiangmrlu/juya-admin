import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { OcrSuggestions } from './ocr-suggestions'

import OcrComparisonLines from './ocr-comparison-lines.vue'

describe('OCR optional metadata', () => {
  it('keeps manual grouping available when position and paragraph are null', async () => {
    const suggestions: OcrSuggestions = {
      template_type: 'dialogue',
      low_confidence_threshold: 0.85,
      lines: [
        {
          id: 0,
          text: 'Coffee time',
          location: null,
          paragraph: null,
          confidence: null,
          low_confidence: true
        }
      ],
      groups: [{ field: 'title', label: '标题', line_ids: [0], reason: '人工复核' }],
      unassigned_line_ids: []
    }
    const wrapper = mount(OcrComparisonLines, {
      props: { suggestions, acceptedGroups: [] },
      global: { plugins: [ElementPlus] }
    })
    expect(wrapper.text()).toContain('位置：未返回')
    expect(wrapper.text()).toContain('置信度：未返回')
    const button = wrapper.findAll('button').find((item) => item.text() === '确认分组并加入候选')!
    await button.trigger('click')
    expect(wrapper.emitted('group')).toEqual([[suggestions.groups[0]]])
  })
})
