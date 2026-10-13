import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { normalizeSceneContent } from '@/features/content-editor/scene-form'

import ContentCandidatesPanel from './content-candidates-panel.vue'

describe('ASR task result handling', () => {
  it.each(['dirty', 'changed-source', 'unmounted'])(
    'discards a late automatic result after %s',
    async (change) => {
      let finish!: (response: Response) => void
      const requests: string[] = []
      const candidate = {
        id: 'candidate-1',
        stale: false,
        revision_id: 'rev-1',
        status: 'READY',
        input_hash: 'input',
        candidate: {
          kind: 'ASR_BOUNDARY',
          edit_version: 3,
          sources: { 's-1': 'Hello.' },
          source_sentences: [{ sentence_id: 's-1', english: 'Hello.' }],
          audio: { version_id: 'audio-1' },
          results: {
            text: 'Hello.',
            boundaries: [],
            alignment_status: 'ALIGNED',
            issues: [],
            alignment: [],
            applied_edit_version: 4
          }
        }
      }
      vi.stubGlobal('fetch', async (url: string) => {
        requests.push(url)
        if (url.includes('/latest'))
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        return new Response(
          JSON.stringify({ stage_id: 'auto-1', status: 'SUCCEEDED', candidate_id: 'candidate-1' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      })
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: { template: '<div />' } }]
      })
      const wrapper = mount(ContentCandidatesPanel, {
        props: {
          revisionId: 'rev-1',
          expectedVersion: 3,
          form: normalizeSceneContent({
            audio: { version_id: 'audio-1' },
            dialogue: [{ id: 's-1', english: 'Hello.' }]
          }),
          dirty: false,
          disabled: false,
          kind: 'ASR_BOUNDARY',
          prepare: async () => null
        },
        global: { plugins: [createPinia(), router, ElementPlus] }
      })
      try {
        await flushPromises()
        expect(finish).toBeDefined()
        if (change === 'unmounted') wrapper.unmount()
        else if (change === 'dirty') await wrapper.setProps({ dirty: true })
        else
          await wrapper.setProps({
            dirty: true,
            form: normalizeSceneContent({
              audio: { version_id: 'audio-2' },
              dialogue: [{ id: 's-1', english: 'Changed.' }]
            })
          })
        finish(
          new Response(JSON.stringify(candidate), {
            headers: { 'Content-Type': 'application/json' }
          })
        )
        await flushPromises()
        expect(wrapper.emitted('saved')).toBeUndefined()
        expect(requests.filter((url) => url === '/api/v1/admin/content/revisions/rev-1')).toEqual(
          []
        )
      } finally {
        if (change !== 'unmounted') wrapper.unmount()
        vi.unstubAllGlobals()
      }
    }
  )
  it('shows unreliable alignment as an exception without creating human confirmation', async () => {
    vi.stubGlobal(
      'fetch',
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('/audio-production')
              ? { stage_id: 'auto-1', status: 'SUCCEEDED', candidate_id: 'candidate-1' }
              : {
                  id: 'candidate-1',
                  stale: false,
                  revision_id: 'rev-1',
                  status: 'READY',
                  input_hash: 'input',
                  candidate: {
                    kind: 'ASR_BOUNDARY',
                    edit_version: 3,
                    sources: {},
                    audio: { version_id: 'audio-1' },
                    results: {
                      text: 'uncertain',
                      boundaries: [],
                      alignment_status: 'NEEDS_REVIEW',
                      issues: [
                        {
                          sentence_id: 's-1',
                          code: 'BOUNDARY_AMBIGUOUS',
                          message: '缺少可靠时间证据，请核对句子边界'
                        }
                      ],
                      alignment: []
                    }
                  }
                }
          ),
          { headers: { 'Content-Type': 'application/json' } }
        )
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }]
    })
    const wrapper = mount(ContentCandidatesPanel, {
      props: {
        revisionId: 'rev-1',
        expectedVersion: 3,
        form: normalizeSceneContent({ audio: { version_id: 'audio-1' } }),
        dirty: false,
        disabled: false,
        kind: 'ASR_BOUNDARY',
        prepare: async () => null
      },
      global: { plugins: [createPinia(), router, ElementPlus] }
    })
    try {
      await flushPromises()
      expect(wrapper.text()).toContain('音文匹配存在异常')
      expect(wrapper.text()).toContain('s-1：缺少可靠时间证据')
      expect(wrapper.emitted('saved')).toBeUndefined()
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })
  it.each([3, 4, 6])(
    'restores applied ASR after unrelated saved edits at version %s without human confirmation',
    async (currentVersion) => {
      const requests: string[] = []
      vi.stubGlobal('fetch', async (url: string) => {
        requests.push(url)
        const body = url.includes('/audio-production')
          ? {
              stage_id: 'auto-1',
              status: 'SUCCEEDED',
              error_code: null,
              candidate_id: 'candidate-1',
              input_hash: 'input'
            }
          : url.includes('/latest')
            ? {
                id: 'candidate-1',
                stale: false,
                revision_id: 'rev-1',
                status: 'READY',
                input_hash: 'input',
                candidate: {
                  kind: 'ASR_BOUNDARY',
                  edit_version: 3,
                  sources: { 's-1': 'Hello.' },
                  source_sentences: [{ sentence_id: 's-1', english: 'Hello.' }],
                  audio: { version_id: 'audio-1' },
                  results: {
                    text: 'Hello.',
                    boundaries: [],
                    alignment_status: 'ALIGNED',
                    issues: [],
                    alignment: [{ sentence_id: 's-1', start_ms: 0, end_ms: 500, match_score: 1 }],
                    applied_edit_version: 5
                  }
                }
              }
            : {
                id: 'rev-1',
                scene_id: 'scene-1',
                version: 6,
                status: 'DRAFT',
                content: {
                  audio: { version_id: 'audio-1' },
                  dialogue: [
                    {
                      id: 's-1',
                      english: 'Hello.',
                      start_ms: 0,
                      end_ms: 500,
                      timing_confirmed: false
                    }
                  ]
                },
                stable_entry_ids: [],
                stable_sentence_ids: ['s-1']
              }
        return new Response(JSON.stringify(body), {
          headers: { 'Content-Type': 'application/json' }
        })
      })
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: { template: '<div />' } }]
      })
      const wrapper = mount(ContentCandidatesPanel, {
        props: {
          revisionId: 'rev-1',
          expectedVersion: currentVersion,
          form: normalizeSceneContent({
            audio: { version_id: 'audio-1' },
            dialogue: [{ id: 's-1', english: 'Hello.' }]
          }),
          dirty: false,
          disabled: false,
          kind: 'ASR_BOUNDARY',
          prepare: async () => null
        },
        global: { plugins: [createPinia(), router, ElementPlus] }
      })
      try {
        await flushPromises()
        expect(requests).toContain(
          '/api/v1/admin/content/revisions/rev-1/candidates/latest?kind=ASR_BOUNDARY'
        )
        expect(wrapper.text()).toContain('自动对齐已完成')
        expect(wrapper.text()).toContain('s-1')
        expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({
          version: 6,
          content: { dialogue: [{ timing_confirmed: false }] }
        })
      } finally {
        wrapper.unmount()
        vi.unstubAllGlobals()
      }
    }
  )
  it.each([
    { currentVersion: 3, stale: false },
    { currentVersion: 4, stale: false },
    { currentVersion: 4, stale: true },
    { currentVersion: 4, stale: undefined },
    { currentVersion: 4, stale: false, kind: 'AI_LEXICON' as const }
  ])(
    'gates failed ASR recovery at version $currentVersion by verified stale=$stale',
    async ({ currentVersion, stale, kind = 'ASR_BOUNDARY' as const }) => {
      vi.stubGlobal(
        'fetch',
        async () =>
          new Response(
            JSON.stringify({
              id: 'candidate-1',
              stale,
              revision_id: 'rev-1',
              status: 'FAILED',
              stage_id: 'asr-stage-1',
              stage_status: 'FAILED',
              input_hash: 'input',
              candidate: {
                kind,
                edit_version: 3,
                sources: {},
                source_sentences: [],
                audio: { version_id: 'audio-1' }
              }
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
      )
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: { template: '<div />' } }]
      })
      const wrapper = mount(ContentCandidatesPanel, {
        props: {
          revisionId: 'rev-1',
          expectedVersion: currentVersion,
          form: normalizeSceneContent({ audio: { version_id: 'audio-1' } }),
          dirty: false,
          disabled: false,
          kind,
          prepare: async () => null
        },
        global: { plugins: [createPinia(), router, ElementPlus] }
      })
      try {
        await wrapper.find('input[aria-label="候选任务编号"]').setValue('candidate-1')
        await wrapper
          .findAll('button')
          .find((button) => button.text() === '恢复 / 刷新候选')!
          .trigger('click')
        await flushPromises()
        expect(wrapper.text()).toContain('处理失败')
        const recovery = wrapper.findComponent({ name: 'ContentStageRecoveryPanel' })
        if (stale !== false || kind === 'AI_LEXICON') {
          expect(recovery.exists()).toBe(false)
          expect(wrapper.text()).toContain(stale === true ? '原音文候选已陈旧' : '尚未核验')
          return
        }
        expect(recovery.exists()).toBe(true)
        expect(recovery.props()).toMatchObject({
          stageId: 'asr-stage-1',
          expectedEditVersion: currentVersion
        })
        expect(wrapper.text()).not.toContain('草稿或音频依赖已变化')
        expect(wrapper.find('input[aria-label="失败阶段编号"]').element).toHaveProperty(
          'value',
          'asr-stage-1'
        )
      } finally {
        wrapper.unmount()
        vi.unstubAllGlobals()
      }
    }
  )
})
