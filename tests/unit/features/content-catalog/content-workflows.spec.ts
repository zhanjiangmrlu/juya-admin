import { flushPromises, mount } from '@vue/test-utils'
import { ElSelect } from 'element-plus'
import { afterEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
const { request, operation, execute } = vi.hoisted(() => ({
  request: vi.fn(),
  operation: vi.fn(),
  execute: vi.fn()
}))
vi.mock('@/services/http-client', () => ({ api: { request, operation } }))
import ContentCategoryStatistics from '@/features/content-catalog/content-category-statistics.vue'
import VocabularySourceReview from '@/features/content-catalog/vocabulary-source-review.vue'
import ImportContentTypes from '@/features/imports/import-content-types.vue'
import ImportDuplicateDetails from '@/features/imports/import-duplicate-details.vue'
import { blankContent } from '@/features/scenes/editor-model'
import SceneContentType from '@/features/scenes/scene-content-type.vue'
import SceneTypeHistory from '@/features/scenes/scene-type-history.vue'
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers.length = 0
  vi.clearAllMocks()
  vi.useRealTimers()
})
const button = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('button').find((item) => item.text().includes(text))!
it('never derives an explicit content type from a PDF and retains conflicting draft choices', async () => {
  const wrapper = mount(SceneContentType, { props: { modelValue: null, hasPdf: true } })
  wrappers.push(wrapper)
  expect(wrapper.text()).toContain('待补类型')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await wrapper.setProps({ modelValue: 'illustrated' })
  expect(wrapper.text()).toContain('明确移除PDF')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})
it('previews only the selected versioned candidates, shows overwrite impact and waits for explicit confirmation', async () => {
  const preview = {
    count: 1,
    version: 'frozen',
    items: [
      {
        id: 'stable-1',
        revision: 7,
        old_type: null,
        new_type: 'intensive',
        pdf_conflict: true
      }
    ]
  }
  request.mockResolvedValue(preview)
  execute.mockResolvedValue({ id: 'batch', items: [] })
  operation.mockReturnValue(execute)
  const flush = vi.fn(async () => true)
  const wrapper = mount(ImportContentTypes, {
    props: { batchId: 'batch', items: [{ id: 'stable-1', revision: 7 }], flush },
    global: { stubs: { ElDialog: { template: '<section><slot/><slot name="footer"/></section>' } } }
  })
  wrappers.push(wrapper)
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'intensive')
  await button(wrapper, '批量指定类型').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledWith('/api/admin/v1/imports/batch/content-types/preview', {
    method: 'POST',
    body: { items: [{ id: 'stable-1', revision: 7 }], content_type: 'intensive', overwrite: false }
  })
  expect(wrapper.text()).toContain('stable-1')
  expect(wrapper.text()).toContain('冲突，须修正后发布')
  expect(execute).not.toHaveBeenCalled()
  await button(wrapper, '确认应用类型').trigger('click')
  await flushPromises()
  expect(execute).toHaveBeenCalledOnce()
  expect(wrapper.emitted('applied')).toHaveLength(1)
})
it('requires explicit history confirmation and never automatically enables categories', async () => {
  request.mockResolvedValue({
    items: [
      {
        card_id: 'old-card',
        name: '历史卡',
        snapshot: 'snapshot-1',
        suggestion: 'intensive',
        warnings: ['仅草稿附件需核对'],
        study_note_version_id: null
      }
    ],
    total: 1,
    page: 1,
    total_pages: 1,
    content_types_ready: false
  })
  operation.mockReturnValue(execute)
  execute.mockResolvedValue({ items: [{ card_id: 'old-card', status: 'confirmed' }] })
  const wrapper = mount(SceneTypeHistory, {
    global: { stubs: { ElDialog: { template: '<section><slot/><slot name="footer"/></section>' } } }
  })
  wrappers.push(wrapper)
  await flushPromises()
  expect(operation).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('仅草稿附件需核对')
  await wrapper.get('[aria-label="归类 历史卡"] input').setValue(true)
  await button(wrapper, '确认应用选中归类').trigger('click')
  await flushPromises()
  expect(operation).toHaveBeenCalledWith('POST', '/api/admin/v1/content-types/confirm', {
    items: [{ card_id: 'old-card', snapshot: 'snapshot-1', content_type: 'intensive' }]
  })
  expect(execute).not.toHaveBeenCalled()
  await button(wrapper, '确认归类').trigger('click')
  await flushPromises()
  expect(operation.mock.calls.some((call) => call[1].endsWith('/enable'))).toBe(false)
})
it.each(['scene', 'listening'] as const)(
  'loads %s persistent duplicate details across pages and prevents opening unavailable targets',
  async (module) => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
    })
    await router.push('/imports?batch=batch')
    request.mockImplementation(async (path: string) => ({
      items: [
        {
          candidate_id: path.includes('page=2') ? 'duplicate-21' : 'duplicate-1',
          source_name: 'archive.zip',
          source_path: 'folder/doc.docx',
          title_zh: '重复资料',
          title_en: 'Duplicate',
          reason: 'cross_package',
          target_kind: 'scene_card',
          target_id: 'removed',
          target_available: false
        }
      ],
      total: 21,
      page: path.includes('page=2') ? 2 : 1,
      total_pages: 2
    }))
    const wrapper = mount(ImportDuplicateDetails, {
      props: { batchId: 'batch', module },
      global: {
        plugins: [router],
        stubs: { ElDialog: { template: '<section><slot/><slot name="footer"/></section>' } }
      }
    })
    wrappers.push(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('跨ZIP重复')
    expect(button(wrapper, '目标已移除').attributes('disabled')).toBeDefined()
    await wrapper.get('.btn-next').trigger('click')
    await flushPromises()
    expect(request.mock.calls.at(-1)?.[0]).toContain(
      `/api/admin/v1/${module === 'listening' ? 'listening/' : ''}imports/batch/duplicates`
    )
    expect(request.mock.calls.at(-1)?.[0]).toContain('page=2')
    expect(wrapper.text()).toContain('共 21 条')
  }
)
it('uses server word forms and exact original coordinates without a manual confirmation requirement', async () => {
  vi.useFakeTimers()
  const content = blankContent()
  content.dialogue = [
    { id: 'line', speaker: 'A', english: '😀 I bought coffee.', chinese: '买咖啡' }
  ]
  content.vocabulary = [
    {
      id: 'word',
      english: 'buy',
      meaning: '买',
      phonetic: '',
      source_hint: '',
      pronunciation_text: 'buy',
      pronunciation_issue: false,
      source: null
    }
  ]
  const matched = [
    { ...content.vocabulary[0], source: { line_id: 'line', start: 5, end: 11, quote: 'bought' } }
  ]
  request.mockResolvedValue({ module: 'scene', vocabulary: matched })
  const wrapper = mount(VocabularySourceReview, { props: { module: 'scene', content } })
  wrappers.push(wrapper)
  await vi.advanceTimersByTimeAsync(350)
  await flushPromises()
  expect(request.mock.calls[0]?.[0]).toBe('/api/admin/v1/vocabulary/sources/preview')
  expect(wrapper.emitted('matched')?.[0]?.[0]).toEqual(matched)
  await wrapper.setProps({ content: { ...content, vocabulary: matched } })
  expect(wrapper.text()).toContain('bought')
  expect(wrapper.text()).toContain('无需手动确认')
})

it('does not turn unavailable statistics into zero and labels retained combined snapshots as stale', async () => {
  const wrapper = mount(ContentCategoryStatistics, {
    props: { title: '精读词汇', unit: '张', error: '服务不可用' }
  })
  wrappers.push(wrapper)
  expect(wrapper.text()).toContain('暂不可用')
  expect(wrapper.text()).not.toContain('内容总数0')
  await wrapper.setProps({ value: { total: 0, published: 0, free: 0, remaining: 0 }, error: '' })
  expect(wrapper.text()).toContain('内容总数0')
  await wrapper.setProps({ error: '重试失败' })
  expect(wrapper.text()).toContain('保留旧快照，未刷新')
})
it('ignores a late vocabulary preview after the administrator changes the original word', async () => {
  vi.useFakeTimers()
  let resolveOld!: (value: unknown) => void
  request
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        })
    )
    .mockResolvedValueOnce({
      module: 'scene',
      vocabulary: [
        {
          id: 'w',
          english: 'coffee',
          meaning: '咖啡',
          source: { line_id: 'line', start: 0, end: 6, quote: 'coffee' }
        }
      ]
    })
  const content = blankContent()
  content.dialogue = [{ id: 'line', speaker: 'A', english: 'coffee', chinese: '咖啡' }]
  content.vocabulary = [
    {
      id: 'w',
      english: 'buy',
      meaning: '买',
      phonetic: '',
      source_hint: '',
      pronunciation_text: 'buy',
      pronunciation_issue: false
    }
  ]
  const wrapper = mount(VocabularySourceReview, { props: { module: 'scene', content } })
  wrappers.push(wrapper)
  await vi.advanceTimersByTimeAsync(350)
  await wrapper.setProps({
    content: {
      ...content,
      vocabulary: [{ ...content.vocabulary[0]!, english: 'coffee', meaning: '咖啡' }]
    }
  })
  await vi.advanceTimersByTimeAsync(350)
  await flushPromises()
  resolveOld({
    module: 'scene',
    vocabulary: [{ id: 'w', english: 'buy', source: null, source_reason: 'source_unmatched' }]
  })
  await flushPromises()
  expect(wrapper.emitted('matched')).toHaveLength(1)
  expect(wrapper.emitted('matched')?.[0]?.[0]).toEqual([
    expect.objectContaining({ english: 'coffee' })
  ])
})
