import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { ProductionSchema as S } from './work-order-model'

import WorkOrderImport from './work-order-import.vue'

const preview = {
  work_order_id: 'one',
  batch_id: 'batch',
  status: 'PARTIAL',
  preview_hash: 'a'.repeat(64),
  preview_version: 1,
  batch_issues: [],
  items: [
    {
      item_id: 'saved',
      import_item_id: 'saved-row',
      import_content_id: 'scene-one',
      row_no: 5,
      operation: 'SKIP',
      status: 'SUCCESS',
      candidate: { title_en: 'Hello' },
      issues: [],
      defaults: [],
      resources: {},
      entries: [],
      source_snapshot: null,
      result: { item_id: 'saved-row', status: 'SUCCESS', operation: 'CREATE' }
    },
    {
      item_id: 'failed',
      import_item_id: 'failed-row',
      import_content_id: 'scene-two',
      row_no: 6,
      operation: 'CREATE',
      status: 'FAILED',
      candidate: { title_en: 'Station' },
      issues: [
        {
          id: 'missing',
          code: 'IMPORT_RESOURCE_INVALID',
          message: '包内音频路径不存在',
          location: ['audio_path'],
          correction_target: 'source',
          severity: 'ERROR'
        }
      ],
      defaults: [],
      resources: {},
      entries: [],
      source_snapshot: null,
      result: { item_id: 'failed-row', status: 'FAILED', error_code: 'IMPORT_RESOURCE_INVALID' }
    }
  ]
} as unknown as S['ImportPreview']

describe('独立ZIP阶段', () => {
  it('缺少持久结果不能宣称导入完成', async () => {
    const wrapper = mount(WorkOrderImport, {
      props: {
        preview: { ...preview, items: preview.items.map((row) => ({ ...row, result: null })) },
        busy: false,
        phase: 'result'
      },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('导入结果待核实，尚未发布')
    expect(wrapper.text()).not.toContain('导入完成，尚未发布')
  })
  it('纯阅读对应预览只展示正文与素材，不恢复词表区域', async () => {
    const wrapper = mount(WorkOrderImport, {
      props: { preview, busy: false, phase: 'preview', contentType: 'short_reading' },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain('素材与词表对应')
    expect(wrapper.text()).not.toContain('词汇 0')
  })
  it('校验阶段定位真实行与ID，明确排除指定行', async () => {
    const wrapper = mount(WorkOrderImport, {
      props: { preview, busy: false, phase: 'validation' },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('第 6 行')
    expect(wrapper.text()).toContain('scene-two')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '排除此行')!
      .trigger('click')
    expect(wrapper.emitted('exclude')?.[0]).toEqual(['failed'])
    expect(wrapper.text()).not.toContain('将保存的正文与译文')
  })
  it('结果阶段按持久回执展示新增，不能把重算SKIP变成跳过', async () => {
    const wrapper = mount(WorkOrderImport, {
      props: { preview, busy: false, phase: 'result' },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('新增 1 篇')
    expect(wrapper.text()).toContain('跳过 0 篇')
    expect(wrapper.text()).toContain('失败 1 篇')
    expect(wrapper.text()).toContain('导入完成，尚未发布')
  })
})
