import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import type { ProductionSchema as S } from './work-order-model'

import WorkOrderImport from './work-order-import.vue'

const /** 创建带有独立核对要求的待保存篇目
   * @param itemId - 本篇稳定标识
   * @param fields - 本场景需要覆盖的预览字段
   * @returns 真实组件使用的导入预览篇目
   */ pendingItem = (
    itemId: string,
    fields: Partial<S['ImportPreviewItem']> = {}
  ): S['ImportPreviewItem'] => ({
    item_id: itemId,
    import_item_id: `${itemId}-row`,
    import_content_id: `${itemId}-source`,
    row_no: 2,
    operation: 'CREATE',
    status: 'PENDING',
    candidate: { title_zh: itemId },
    issues: [],
    defaults: [],
    resources: {},
    entries: [],
    source_snapshot: null,
    result: null,
    ...fields
  })

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
  it('在保存区域说明未选篇目的原因，选择无问题篇目后直接允许保存', async () => {
    const wrapper = mount(WorkOrderImport, {
      props: { preview: { ...preview, items: [pendingItem('正常篇目')] }, busy: false },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    const review = wrapper.get('[aria-label="保存前确认"]')
    expect(review.text()).toContain('请先在上方表格选择需要保存的篇目')
    expect(review.find('button.el-button--primary').attributes('disabled')).toBeDefined()
    await wrapper.get('.el-table__body input[type="checkbox"]').setValue(true)
    expect(review.find('button.el-button--primary').attributes('disabled')).toBeUndefined()
    expect(review.find('[role="status"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('差异确认与保存按钮相邻，逐篇确认后保留原有提交字段', async () => {
    const warning = {
      id: 'difference',
      code: 'SOURCE_SENTENCE_MISMATCH',
      message: '来源原句与指定正文位置不一致',
      location: ['source_sentence'],
      correction_target: 'source',
      severity: 'WARNING'
    } as S['WorkIssue']
    const wrapper = mount(WorkOrderImport, {
      props: {
        preview: {
          ...preview,
          items: [
            pendingItem('第一篇', { issues: [warning] }),
            pendingItem('第二篇', { issues: [{ ...warning, id: 'second-difference' }] })
          ]
        },
        busy: false
      },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    const selections = wrapper.findAll('.el-table__body input[type="checkbox"]')
    await selections[0]!.setValue(true)
    await selections[1]!.setValue(true)
    const review = wrapper.get('[aria-label="保存前确认"]')
    expect(review.get('[role="status"]').text()).toContain('第一篇：尚未确认原文与表格差异')
    expect(review.get('[role="status"]').text()).toContain('第二篇：尚未确认原文与表格差异')
    const confirmations = review.findAll('input[type="checkbox"]')
    expect(confirmations).toHaveLength(2)
    await confirmations[0]!.setValue(true)
    expect(review.get('[role="status"]').text()).not.toContain('第一篇：尚未确认')
    expect(review.find('button.el-button--primary').attributes('disabled')).toBeDefined()
    await confirmations[1]!.setValue(true)
    expect(review.find('[role="status"]').exists()).toBe(false)
    await review.get('button.el-button--primary').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([
      {
        scope: 'selected',
        selected_item_ids: ['第一篇', '第二篇'],
        preview_hash: 'a'.repeat(64),
        preview_version: 1,
        acknowledged_defaults: [],
        confirmed_conflicts: ['第一篇-row:source_sentence', '第二篇-row:source_sentence']
      }
    ])
    await selections[0]!.setValue(false)
    expect(review.findAll('input[type="checkbox"]')).toHaveLength(1)
    expect(review.text()).not.toContain('第一篇')
    wrapper.unmount()
  })

  it('差异确认不能绕过默认素材确认，忙碌时显示处理中原因', async () => {
    const wrapper = mount(WorkOrderImport, {
      props: {
        preview: {
          ...preview,
          items: [pendingItem('需默认封面', { defaults: ['default_cover'] })]
        },
        busy: false
      },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    await wrapper.get('.el-table__body input[type="checkbox"]').setValue(true)
    const review = wrapper.get('[aria-label="保存前确认"]')
    expect(review.get('[role="status"]').text()).toContain(
      '需默认封面：尚未确认默认素材：确认使用默认封面'
    )
    expect(review.find('button.el-button--primary').attributes('disabled')).toBeDefined()
    const defaultCheckbox = wrapper
      .findAll('label.el-checkbox')
      .find((label) => label.text() === '确认使用默认封面')!
    await defaultCheckbox.get('input').setValue(true)
    expect(review.find('button.el-button--primary').attributes('disabled')).toBeUndefined()
    await wrapper.setProps({ busy: true })
    expect(review.get('[role="status"]').text()).toContain('正在处理，请稍候再保存')
    expect(review.find('button.el-button--primary').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('已选篇目出现阻断错误时，即使确认差异仍禁止保存并显示真实错误', async () => {
    const row = pendingItem('阻断篇目')
    const livePreview = reactive({ ...preview, items: [row] })
    const wrapper = mount(WorkOrderImport, {
      props: { preview: livePreview, busy: false },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    await wrapper.get('.el-table__body input[type="checkbox"]').setValue(true)
    livePreview.items[0]!.issues = preview.items[1]!.issues
    await flushPromises()
    const review = wrapper.get('[aria-label="保存前确认"]')
    await review.get('input[type="checkbox"]').setValue(true)
    expect(review.get('[role="status"]').text()).toContain('包内音频路径不存在')
    expect(review.find('button.el-button--primary').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('confirm')).toBeUndefined()
    wrapper.unmount()
  })

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
