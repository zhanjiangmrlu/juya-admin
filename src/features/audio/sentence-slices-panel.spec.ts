import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { normalizeSceneContent } from '@/features/content-editor/scene-form'
import { ApiError } from '@/shared/errors/api-error'

import SentenceSlicesPanel from './sentence-slices-panel.vue'

const { listSlices, recutSlice } = vi.hoisted(() => ({ listSlices: vi.fn(), recutSlice: vi.fn() }))
vi.mock('./sentence-slice-adapter', () => ({
  createSentenceSliceAdapter: () => ({ available: true, list: listSlices, recut: recutSlice })
}))

describe('sentence boundary correction', () => {
  beforeEach(() => {
    listSlices.mockResolvedValue([])
  })
  it('discards an in-flight recut after switching the revision even while the command is busy', async () => {
    const pause = vi
      .spyOn(globalThis.HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined)
    Object.defineProperty(globalThis.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn()
    })
    let finish!: (value: unknown) => void
    recutSlice.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const form = normalizeSceneContent({
      audio: { version_id: 'audio-1', duration_ms: 1000 },
      dialogue: [{ id: 's-1', english: 'Hello', start_ms: 0, end_ms: 500 }]
    })
    const saved = {
      id: 'rev-1',
      sceneId: 'scene-1',
      version: 3,
      status: 'DRAFT',
      content: form,
      createdAt: null,
      createdBy: 'admin',
      sourceRevisionId: null,
      stableEntryIds: [],
      stableSentenceIds: ['s-1']
    }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }]
    })
    const wrapper = mount(SentenceSlicesPanel, {
      props: {
        form,
        revisionId: 'rev-1',
        expectedVersion: 3,
        disabled: false,
        prepare: async () => saved
      },
      global: { plugins: [createPinia(), router, ElementPlus] }
    })
    try {
      await flushPromises()
      await wrapper
        .findAll('button')
        .find((button) => button.text() === '调整边界')!
        .trigger('click')
      await wrapper
        .findAll('button')
        .find((button) => button.text() === '仅重生成这一句')!
        .trigger('click')
      await flushPromises()
      expect(finish).toBeDefined()
      await wrapper.setProps({ revisionId: 'rev-2' })
      finish(saved)
      await flushPromises()
      expect(wrapper.emitted('saved')).toBeUndefined()
    } finally {
      wrapper.unmount()
      pause.mockRestore()
      Reflect.deleteProperty(globalThis.HTMLElement.prototype, 'scrollIntoView')
    }
  })
  it.each(['attached', 'version-conflict'])(
    'reloads the real draft version after worker %s',
    async (state) => {
      const pause = vi
        .spyOn(globalThis.HTMLMediaElement.prototype, 'pause')
        .mockImplementation(() => undefined)
      listSlices.mockResolvedValue([
        { sentenceId: 's-1', editVersion: 4, status: 'READY_TO_LISTEN' }
      ])
      if (state === 'version-conflict')
        listSlices.mockRejectedValue(
          new ApiError({
            code: 'REVISION_VERSION_CONFLICT',
            requestId: 'worker-version-conflict',
            status: 409,
            message: '草稿已更新'
          })
        )
      vi.stubGlobal(
        'fetch',
        async () =>
          new Response(
            JSON.stringify({
              id: 'rev-1',
              scene_id: 'scene-1',
              version: 4,
              status: 'DRAFT',
              content: { dialogue: [{ id: 's-1', english: 'Hello', timing_confirmed: false }] },
              stable_entry_ids: [],
              stable_sentence_ids: ['s-1']
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
      )
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: { template: '<div />' } }]
      })
      const wrapper = mount(SentenceSlicesPanel, {
        props: {
          form: normalizeSceneContent({ dialogue: [{ id: 's-1', english: 'Hello' }] }),
          revisionId: 'rev-1',
          expectedVersion: 3,
          disabled: false,
          prepare: async () => null
        },
        global: { plugins: [createPinia(), router, ElementPlus] }
      })
      try {
        await flushPromises()
        expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({
          id: 'rev-1',
          version: 4,
          content: { dialogue: [{ timing_confirmed: false }] }
        })
      } finally {
        wrapper.unmount()
        pause.mockRestore()
        vi.unstubAllGlobals()
      }
    }
  )
  it('brings the chosen sentence form into view and focuses its start field', async () => {
    listSlices.mockResolvedValue([
      { sentenceId: 'sentence-1', status: 'FAILED', stageId: 'slice-stage-1' }
    ])
    const scroll = vi.fn()
    Object.defineProperty(globalThis.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll
    })
    const pause = vi
      .spyOn(globalThis.HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }]
    })
    const wrapper = mount(SentenceSlicesPanel, {
      attachTo: document.body,
      props: {
        form: normalizeSceneContent({
          dialogue: [{ id: 'sentence-1', english: 'Hello', chinese: '你好' }]
        }),
        revisionId: 'rev-1',
        expectedVersion: 1,
        disabled: false,
        prepare: async () => null
      },
      global: { plugins: [createPinia(), router, ElementPlus] }
    })
    try {
      await flushPromises()
      await wrapper
        .findAll('button')
        .find((button) => button.text() === '调整边界')!
        .trigger('click')
      await flushPromises()
      expect(wrapper.find('.boundary-form').text()).toContain('Hello')
      expect(scroll).toHaveBeenCalled()
      expect(document.activeElement).toBe(wrapper.find('.boundary-form input').element)
      expect(wrapper.findComponent({ name: 'ContentStageRecoveryPanel' }).exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'ContentStageRecoveryPanel' }).props()).toMatchObject({
        stageId: 'slice-stage-1',
        expectedEditVersion: 1
      })
    } finally {
      wrapper.unmount()
      pause.mockRestore()
      Reflect.deleteProperty(globalThis.HTMLElement.prototype, 'scrollIntoView')
      vi.unstubAllGlobals()
    }
  })
})
