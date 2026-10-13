import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import nestedSnapshot from './fixtures/nested-docx-source.json'
import WorkOrderOriginal from './work-order-original.vue'
describe('不可变原文面板', () => {
  it('实际 DOCX 解析快照包含内层表格且等价单元格正文不重复', () => {
    const wrapper = mount(WorkOrderOriginal, {
      props: { snapshot: nestedSnapshot },
      global: { plugins: [ElementPlus] }
    })
    const paragraphs = wrapper.findAll('article p').map((row) => row.text())
    expect(paragraphs.filter((value) => value === 'nested original explanation')).toHaveLength(1)
    expect(paragraphs.filter((value) => value === '你好')).toHaveLength(1)
    expect(wrapper.text()).toContain('表 1 · 第 2 行 · 第 2 列 · 内嵌表 2 · 第 1 行 · 第 1 列')
  })
  it('统一 ZIP 同时呈现多文档、真实工作簿行和冲突两侧，不用候选替代原值', () => {
    const wrapper = mount(WorkOrderOriginal, {
      props: {
        snapshot: {
          origin: 'zip',
          document_path: 'lesson.docx',
          documents: [
            { blocks: [{ text: 'DOCX body', paragraph_index: 4 }] },
            { blocks: [{ text: 'Second body' }] }
          ],
          workbook: {
            content_row: { row_no: 8, values: { title_en: 'Excel title', empty: null } },
            entry_rows: [
              {
                row_no: 12,
                values: { chinese: '原表词义', english: 'bank' },
                cells: [{ column: 3, heading: 'chinese', value: '原表词义', data_type: 's' }]
              }
            ]
          },
          conflicts: {
            title_en: { document: 'Doc title', workbook: 'Excel title' },
            lexicon: { document: [{ chinese: '文档词义' }], workbook: [{ chinese: '原表词义' }] }
          }
        }
      },
      global: { plugins: [ElementPlus] }
    })
    for (const text of [
      'DOCX body',
      'Second body',
      'Excel title',
      '原表词义',
      '文档词义',
      'Doc title',
      '第 8 行',
      '第 12 行',
      '文档侧',
      '表格侧',
      'lesson.docx'
    ])
      expect(wrapper.text()).toContain(text)
    expect(wrapper.text()).not.toContain('[object Object]')
  })
  it('只有词汇表时保留原值，已引用但未保留正文时明确提示', () => {
    const wrapper = mount(WorkOrderOriginal, {
      props: {
        snapshot: {
          origin: 'zip',
          document_path: 'missing.docx',
          blocks: [],
          workbook: { entry_rows: [{ row_no: 7, values: { english: 'bank', chinese: '河岸' } }] }
        }
      },
      global: { plugins: [ElementPlus] }
    })
    expect(wrapper.text()).toContain('河岸')
    expect(wrapper.text()).toContain('第 7 行')
    expect(wrapper.text()).toContain('未保留文档正文')
  })
  it('只读快照不引用编辑中的候选', () => {
    const wrapper = mount(WorkOrderOriginal, {
      props: { snapshot: { blocks: [{ text: 'Original English', paragraph_index: 2 }] } },
      global: { plugins: [ElementPlus] }
    })
    expect(wrapper.text()).toContain('Original English')
    expect(wrapper.text()).toContain('第 2 段')
  })
  it('缺失快照明确提示补充，不显示空的伪原文', () => {
    const wrapper = mount(WorkOrderOriginal, {
      props: { snapshot: null },
      global: { plugins: [ElementPlus] }
    })
    expect(wrapper.text()).toContain('未保留可验证的原始正文')
  })
})
