import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElCheckbox, ElCheckboxGroup } from 'element-plus'
import { describe, expect, it } from 'vitest'

import type { ProductionSchema as S, WorkItem } from './work-order-model'

import WorkOrderImport from './work-order-import.vue'
import WorkOrderPublication from './work-order-publication.vue'

describe('固定预览范围的人工作业确认', () => {
  it('冻结标题只复用相同内容和完整候选哈希，同RID修订不冒充历史标题', async () => {
    const candidate = {
      content_type: 'short_reading',
      content_id: 'original-content',
      revision_id: 'same-revision',
      candidate_hash: 'original-hash',
      expected_version: 1
    }
    const member = {
      work_order_id: 'order',
      content_id: 'original-content',
      revision_id: 'same-revision',
      candidate_hash: 'original-hash',
      title_en: 'Original frozen title',
      content_version: 2,
      published: true
    } as WorkItem
    const state = {
      work_order_id: 'order',
      token: 'token',
      status: 'PARTIAL',
      collection_hash: 'hash',
      candidates: [candidate],
      results: [{ revision_id: 'same-revision', status: 'FAILED' }]
    } as unknown as S['PublicationState']
    const wrapper = mount(WorkOrderPublication, {
      props: {
        state,
        contentType: 'short_reading',
        items: [member],
        busy: false,
        membersReady: true
      },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Original frozen title')
    await wrapper.setProps({
      items: [{ ...member, candidate_hash: 'new-hash', title_en: 'Corrected new title' }]
    })
    expect(wrapper.text()).not.toContain('Corrected new title')
    expect(wrapper.text()).toContain('原冻结候选（原标题暂无法核验）')
    expect(wrapper.text()).toContain('original-content')
    expect(wrapper.text()).toContain('same-revision')
    await wrapper.setProps({
      items: [{ ...member, content_id: 'other-content', title_en: 'Foreign title' }]
    })
    expect(wrapper.text()).not.toContain('Foreign title')
    await wrapper.setProps({ items: [member], contentType: 'dialogue' })
    expect(wrapper.text()).not.toContain('Original frozen title')
    await wrapper.setProps({ contentType: 'short_reading' })
    expect(wrapper.text()).toContain('Original frozen title')
    wrapper.unmount()
  })
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
  it('结果阶段只明确重试 FAILED，UNKNOWN 不加入失败重试且不显示范围勾选', async () => {
    const state = {
      token: 'token',
      status: 'PARTIAL',
      collection_hash: 'first',
      candidates: [{ revision_id: 'one' }, { revision_id: 'two' }, { revision_id: 'three' }],
      results: [
        { revision_id: 'one', status: 'SUCCEEDED' },
        { revision_id: 'two', status: 'UNKNOWN', error_code: 'PUBLICATION_ITEM_RESULT_UNKNOWN' },
        { revision_id: 'three', status: 'FAILED', error_code: 'PUBLICATION_PREVIEW_STALE' }
      ]
    } as unknown as S['PublicationState']
    const wrapper = mount(WorkOrderPublication, {
      props: { state, items: [], busy: false, membersReady: true },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.findComponent(ElCheckbox).exists()).toBe(false)
    const button = () => wrapper.findAll('button').find((row) => row.text().startsWith('仅重试'))!
    expect(button().text()).toContain('1 篇')
    await button().trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[true]])
    expect(wrapper.text()).toContain('成功已保留')
    expect(wrapper.text()).toContain('PUBLICATION_PREVIEW_STALE')
    expect(wrapper.text()).toContain('待核实')
    const failedTable = wrapper.find('.publication-failed-table')
    expect(failedTable.exists()).toBe(true)
    expect(failedTable.findAll('.el-table__body tbody tr')).toHaveLength(1)
    expect(failedTable.text()).toContain('PUBLICATION_PREVIEW_STALE')
    expect(failedTable.text()).not.toContain('PUBLICATION_ITEM_RESULT_UNKNOWN')
    expect(wrapper.find('.publication-unknown').text()).toContain('PUBLICATION_ITEM_RESULT_UNKNOWN')
  })
  it.each(['QUEUED', 'RUNNING', 'FAILED', 'COMPLETED'])(
    '%s 无逐篇结果也不回到确认发布',
    async (status) => {
      const wrapper = mount(WorkOrderPublication, {
        props: {
          state: {
            token: 'token',
            status,
            collection_hash: 'hash',
            candidates: [{ revision_id: 'one' }],
            results: []
          } as unknown as S['PublicationState'],
          items: [],
          busy: false,
          membersReady: true
        },
        global: { plugins: [ElementPlus] }
      })
      await flushPromises()
      expect(wrapper.findComponent(ElCheckbox).exists()).toBe(false)
      expect(wrapper.findAll('button').some((button) => button.text().startsWith('确认发布'))).toBe(
        false
      )
      expect(wrapper.text()).toContain('发布结果')
    }
  )
  it('PREVIEW 的版本变化撤销旧人工勾选', async () => {
    const state = {
      token: 'token',
      status: 'PREVIEW',
      version: 1,
      collection_hash: 'hash',
      candidates: [{ revision_id: 'one' }],
      results: []
    } as unknown as S['PublicationState']
    const wrapper = mount(WorkOrderPublication, {
      props: { state, items: [], busy: false, membersReady: true },
      global: { plugins: [ElementPlus] }
    })
    wrapper.findComponent(ElCheckbox).vm.$emit('update:modelValue', true)
    await flushPromises()
    const button = () => wrapper.findAll('button').find((row) => row.text().startsWith('确认发布'))!
    expect(button().attributes('disabled')).toBeUndefined()
    await wrapper.setProps({ state: { ...state, version: 2 } })
    expect(button().attributes('disabled')).toBeDefined()
  })
  it('完整成员未读取时保留草稿数未知，不能确认或重试', async () => {
    const state = {
      token: 'token',
      status: 'PREVIEW',
      version: 1,
      collection_hash: 'hash',
      candidates: [{ revision_id: 'one' }],
      results: []
    } as unknown as S['PublicationState']
    const wrapper = mount(WorkOrderPublication, {
      props: { state, items: [], busy: false, membersReady: false },
      global: { plugins: [ElementPlus] }
    })
    await wrapper.findComponent(ElCheckbox).setValue(true)
    const button = () =>
      wrapper
        .findAll('button')
        .find((row) => row.text().startsWith('确认发布') || row.text().startsWith('仅重试'))!
    expect(button().attributes('disabled')).toBeDefined()
    expect(wrapper.find('.metrics').text()).toContain('待核实')
    await wrapper.setProps({
      state: { ...state, status: 'PARTIAL', results: [{ revision_id: 'one', status: 'FAILED' }] }
    })
    expect(button().attributes('disabled')).toBeDefined()
  })
  it('UNKNOWN 仅显示原任务和实际挂起回执，刷新与续办不触发发布确认', async () => {
    const wrapper = mount(WorkOrderPublication, {
      props: {
        state: {
          token: 'token',
          status: 'PARTIAL',
          stage_id: 'original-stage',
          version: 3,
          collection_hash: 'hash',
          candidates: [{ revision_id: 'one' }],
          results: [
            { revision_id: 'one', status: 'UNKNOWN', error_code: 'PROVIDER_UNDOCUMENTED_CODE' }
          ]
        } as unknown as S['PublicationState'],
        items: [],
        busy: false,
        membersReady: true,
        pendingCommands: [
          {
            command_id: 'original-command',
            action: 'publication-confirm',
            retry_at: '2020-01-01',
            created_at: '2020-01-01'
          },
          {
            command_id: 'unrelated',
            action: 'organize',
            retry_at: '2020-01-01',
            created_at: '2020-01-01'
          }
        ]
      },
      global: { plugins: [ElementPlus] }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('original-stage')
    expect(wrapper.text()).toContain('PROVIDER_UNDOCUMENTED_CODE')
    expect(wrapper.text()).not.toContain('unrelated')
    expect(wrapper.findAll('button').some((row) => row.text().startsWith('仅重试'))).toBe(false)
    await wrapper
      .findAll('button')
      .find((row) => row.text() === '刷新发布结果')!
      .trigger('click')
    await wrapper
      .findAll('button')
      .find((row) => row.text() === '续办原操作回执')!
      .trigger('click')
    expect(wrapper.emitted('refresh')).toEqual([[]])
    expect(wrapper.emitted('resume')).toEqual([['original-command']])
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })
})
