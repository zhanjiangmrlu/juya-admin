import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ContentProofreadingPage from './content-proofreading-page.vue'

vi.mock('@/features/content/content-adapter', () => ({
  createContentAdapter: () => ({
    listScenes: async () => ({
      items: ['zh', 'en', 'empty'].map((id) => ({
        id: `scene-${id}`,
        draftRevisionId: `revision-${id}`,
        title: '',
        templateType: 'dialogue'
      }))
    }),
    getRevision: async (id: string) => ({
      id,
      version: 1,
      content: {
        title_zh: id === 'revision-zh' ? '挑一件值得带回家的纪念品' : '',
        title_en: id === 'revision-en' ? 'A Future from the Past' : ''
      }
    })
  })
}))
vi.mock('@/features/short-reading/short-reading-adapter', () => ({
  createShortReadingAdapter: () => ({ available: false })
}))

describe('proofreading candidate labels', () => {
  it('uses current draft titles and names untitled drafts while preserving revision selection', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ component: { template: '<div />' }, name: 'content-scenes', path: '/' }]
    })
    const wrapper = mount(ContentProofreadingPage, {
      global: {
        plugins: [createPinia(), router, ElementPlus],
        stubs: {
          ContentEntryConfirmationPanel: true,
          ProofreadingSetPanel: true,
          PublicationRangePanel: true
        }
      }
    })
    await vi.waitFor(() => expect(wrapper.findAll('.candidate')).toHaveLength(3))
    expect(wrapper.findAll('.el-checkbox__label').map((label) => label.text())).toEqual([
      '挑一件值得带回家的纪念品',
      'A Future from the Past',
      '未命名场景'
    ])
    expect(wrapper.text()).toContain('scene-zh · revision-zh')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(wrapper.text()).toContain('当前明确选中 1 篇')
    expect(wrapper.findComponent({ name: 'ProofreadingSetPanel' }).props('candidates')).toEqual([
      expect.objectContaining({ contentId: 'scene-zh', revisionId: 'revision-zh' })
    ])
    wrapper.unmount()
  })
})
