import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElCheckbox, ElCheckboxGroup } from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { ProductionSchema as S } from './work-order-model'

import WorkOrderImport from './work-order-import.vue'
import WorkOrderPublication from './work-order-publication.vue'

describe('固定预览范围的人工作业确认', () => {
  it('导入预览变化清除旧勾选与默认素材确认', async () => {
    const preview = {
      preview_hash: 'first',
      preview_version: 1,
      items: [
        {
          item_id: 'one',
          import_item_id: 'source',
          import_content_id: 'file-row',
          status: 'READY',
          candidate: { paragraphs_en: ['Candidate'], translation_zh: '候选译文' },
          source_snapshot: { blocks: [{ text: 'Original' }] },
          defaults: [],
          issues: [],
          resources: {},
          entries: []
        }
      ],
      batch_issues: []
    } as unknown as S['ImportPreview']
    const wrapper = mount(WorkOrderImport, {
      props: { preview, busy: false },
      global: { plugins: [ElementPlus] }
    })
    wrapper.findAllComponents(ElCheckboxGroup)[0]!.vm.$emit('update:modelValue', ['one'])
    await flushPromises()
    const button = () => wrapper.findAll('button').find((row) => row.text().startsWith('确认保存'))!
    await button().trigger('click')
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({
      selected_item_ids: ['one'],
      preview_hash: 'first'
    })
    await wrapper.setProps({ preview: { ...preview, preview_hash: 'changed', preview_version: 2 } })
    expect(button().attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Original')
    expect(wrapper.text()).toContain('Candidate')
  })
  it('发布失败子集重试且范围变化必须重新勾选确认', async () => {
    const state = {
      token: 'token',
      collection_hash: 'first',
      candidates: [{ revision_id: 'one' }, { revision_id: 'two' }],
      results: [
        { revision_id: 'one', status: 'SUCCEEDED' },
        { revision_id: 'two', status: 'UNKNOWN' }
      ]
    } as unknown as S['PublicationState']
    const wrapper = mount(WorkOrderPublication, {
      props: { state, items: [], busy: false, held: 2 },
      global: { plugins: [ElementPlus] }
    })
    wrapper.findComponent(ElCheckbox).vm.$emit('update:modelValue', true)
    await flushPromises()
    const button = () => wrapper.findAll('button').find((row) => row.text().startsWith('仅重试'))!
    expect(button().text()).toContain('1 篇')
    await button().trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[true]])
    await wrapper.setProps({ state: { ...state, collection_hash: 'changed' } })
    expect(button().attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('成功已保留')
  })
})
