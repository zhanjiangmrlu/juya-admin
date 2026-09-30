import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ContentListPage from './content-list-page.vue'

describe('content list page', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads the real scene page and renders an empty-safe table state', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              cover_object_key: null,
              draft_revision_id: 'draft-1',
              id: 'scene-1',
              published_revision_id: 'published-1',
              series_id: 'series-1',
              series_title: '日常英语',
              status: 'PUBLISHED',
              summary: '咖啡店点单',
              title: 'Ordering coffee',
              updated_at: '2026-09-30T10:00:00Z'
            }
          ],
          page: 1,
          page_size: 20,
          total: 1
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchSpy)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ component: { template: '<div />' }, name: 'content-scenes', path: '/' }]
    })
    const wrapper = mount(ContentListPage, {
      global: {
        plugins: [createPinia(), router, ElementPlus],
        stubs: { RouterLink: { template: '<a><slot :navigate="() => {}" /></a>' } }
      }
    })

    await vi.waitFor(() => expect(wrapper.text()).toContain('Ordering coffee'))
    expect(wrapper.text()).toContain('日常英语')
    expect(wrapper.text()).not.toContain('内容列表接口待接入')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
