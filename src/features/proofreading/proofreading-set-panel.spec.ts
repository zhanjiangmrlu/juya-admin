import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLexiconRow, normalizeSceneContent } from '@/features/content-editor/scene-form'

import { candidateHash } from './proofreading-adapter'
import ProofreadingSetPanel from './proofreading-set-panel.vue'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/api/use-admin-api-client', () => ({
  useAdminApiClient: () => ({ request })
}))

describe('word-card proofreading audio', () => {
  afterEach(() => vi.restoreAllMocks())
  it.each([true, false])(
    'requires explicit listening with fixed entry audio and classification has_audio=%s',
    async (hasAudio) => {
      const content = {
        ...normalizeSceneContent({
          template_type: 'word_card',
          vocabulary: [
            {
              ...createLexiconRow(),
              entry_id: 'word-1',
              english: 'hello',
              chinese: '你好',
              audio_version_id: 'word-audio'
            }
          ]
        })
      }
      const hash = await candidateHash(content)
      const set = {
        public_id: 'set-1',
        collection_hash: 'collection',
        status: 'PENDING',
        normal_count: 1,
        candidates: [
          {
            content_type: 'word_card',
            content_id: 'scene-1',
            revision_id: 'rev-1',
            candidate_hash: hash,
            normal: true,
            classification_facts: { has_audio: hasAudio }
          }
        ],
        sample_ids: ['rev-1'],
        confirmed_ids: [] as string[]
      }
      let checks: unknown = null
      request
        .mockReset()
        .mockImplementation(async ({ path, body }: { path: string; body?: unknown }) => {
          if (path.endsWith('/confirm')) {
            checks = body
            set.confirmed_ids = ['rev-1']
            return {}
          }
          if (path.includes('/resources/')) return { url: '/word.wav' }
          if (path.endsWith('/revisions/rev-1'))
            return {
              id: 'rev-1',
              scene_id: 'scene-1',
              version: 1,
              status: 'DRAFT',
              content,
              stable_entry_ids: ['word-1'],
              stable_sentence_ids: []
            }
          return set
        })
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
      const wrapper = mount(ProofreadingSetPanel, {
        props: {
          candidates: [
            {
              contentType: 'word_card',
              contentId: 'scene-1',
              revisionId: 'rev-1',
              title: '词卡',
              content
            }
          ]
        },
        global: { plugins: [ElementPlus] }
      })
      try {
        await wrapper
          .findAll('button')
          .find((button) => button.text() === '建立当前明确候选集合')!
          .trigger('click')
        await flushPromises()
        await vi.waitFor(() =>
          expect(wrapper.find('button[aria-label="播放 hello 发音"]').exists()).toBe(true)
        )
        const audioCheck = wrapper
          .findAll('.el-checkbox')
          .find((label) => label.text() === '已实际试听固定音频与切片')
        expect(audioCheck).toBeDefined()
        expect(audioCheck!.get('input').element).toHaveProperty('checked', false)
        await wrapper
          .findAll('.el-checkbox')
          .find((label) => label.text().startsWith('已核对中英文'))!
          .get('input')
          .setValue(true)
        const confirm = wrapper.findAll('button').find((button) => button.text() === '确认这一篇')!
        expect(confirm.attributes('disabled')).toBeDefined()
        await wrapper.get('button[aria-label="播放 hello 发音"]').trigger('click')
        await flushPromises()
        expect(wrapper.get('audio').element.src).toContain('/word.wav')
        expect(checks).toBeNull()
        expect(audioCheck!.get('input').element).toHaveProperty('checked', false)
        await audioCheck!.get('input').setValue(true)
        await confirm.trigger('click')
        await flushPromises()
        expect(checks).toEqual({
          candidate_hash: hash,
          text_checked: true,
          images_checked: false,
          audio_listened: true
        })
      } finally {
        wrapper.unmount()
      }
    }
  )
})
