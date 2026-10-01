import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import PublishCheckPage from './publish-check-page.vue'

const wrappers: ReturnType<typeof mount>[] = []

async function setup(previewFails = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          previewFails
            ? { code: 'SERVER_ERROR', message: '预览失败' }
            : {
                scene_id: 'scene-from-preview',
                revision_id: 'revision-123',
                revision_status: 'DRAFT',
                scene_title: 'Coffee',
                series_title: 'Daily',
                content: {}
              }
        ),
        { status: previewFails ? 500 : 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'content-publish', path: '/publish/:id', component: PublishCheckPage },
      { name: 'content-scenes', path: '/scenes', component: { template: '<div />' } },
      { name: 'content-scene-edit', path: '/scenes/:id/edit', component: { template: '<div />' } }
    ]
  })
  await router.push('/publish/revision-123')
  const wrapper = mount(PublishCheckPage, {
    global: { plugins: [createPinia(), router, ElementPlus], stubs: { ScenePreview: true } }
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

describe('publish production navigation', () => {
  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
    vi.unstubAllGlobals()
    document.querySelectorAll('.el-message').forEach((element) => element.remove())
  })

  it('shows all six stages and marks publish active', async () => {
    const { wrapper } = await setup()
    for (const label of ['内容列表', '场景草稿', 'OCR候选', '内容校对', '音频标时', '预览发布'])
      expect(wrapper.text()).toContain(label)
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('预览发布')
  })

  it.each([
    ['draft', '场景草稿'],
    ['ocr', 'OCR候选'],
    ['proofread', '内容校对'],
    ['audio', '音频标时']
  ])(
    'returns to %s using the preview scene id instead of the revision id',
    async (stage, label) => {
      const { wrapper, router } = await setup()
      await wrapper
        .findAll('[role="tab"]')
        .find((tab) => tab.text() === label)!
        .trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('content-scene-edit')
      expect(router.currentRoute.value.params.id).toBe('scene-from-preview')
      expect(router.currentRoute.value.query).toEqual({ stage })
    }
  )

  it('can return to the list even when preview loading fails', async () => {
    const { wrapper, router } = await setup(true)
    await wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === '内容列表')!
      .trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('content-scenes')
  })

  it('stays on publish and explains missing scene context when preview loading fails', async () => {
    const { wrapper, router } = await setup(true)
    await wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === '音频标时')!
      .trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('content-publish')
    expect(document.body.textContent).toContain('缺少场景信息')
  })

  it('does not navigate when selecting the already active publish stage', async () => {
    const { wrapper, router } = await setup()
    await wrapper.get('[role="tab"][aria-selected="true"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/publish/revision-123')
  })
})
