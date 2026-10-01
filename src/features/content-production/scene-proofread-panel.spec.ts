import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import DialogueFields from '@/features/content-editor/dialogue-fields.vue'
import LexiconFields from '@/features/content-editor/lexicon-fields.vue'
import LexiconMediaFields from '@/features/content-editor/lexicon-media-fields.vue'
import { normalizeSceneContent } from '@/features/content-editor/scene-form'

import SceneProofreadPanel from './scene-proofread-panel.vue'

const wrappers: ReturnType<typeof mount>[] = []

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})

async function mountPanel() {
  const form = reactive(
    normalizeSceneContent({
      original_image_asset_id: 'IMAGE-1',
      dialogue: [
        { id: 'SENTENCE-1', speaker: 'Alice', english: 'Coffee, please.', chinese: '请来杯咖啡。' },
        { id: 'SENTENCE-2', speaker: 'Bob', english: 'Here you are.', chinese: '给你。' }
      ],
      vocabulary: [
        {
          entry_id: 'WORD-1',
          entry_version: 3,
          english: 'coffee',
          source_sentence_ids: ['SENTENCE-1']
        }
      ],
      chunks: [
        {
          entry_id: 'CHUNK-1',
          entry_version: 2,
          english: 'here you are',
          source_sentence_ids: ['SENTENCE-2']
        }
      ]
    })
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
  await router.push('/')
  const wrapper = mount(SceneProofreadPanel, {
    props: { form },
    global: { plugins: [createPinia(), router, ElementPlus] }
  })
  wrappers.push(wrapper)
  return { form, wrapper }
}

describe('scene proofread panel', () => {
  it('edits and reorders draft sentences without changing stable IDs or showing timing', async () => {
    const { form, wrapper } = await mountPanel()
    expect(wrapper.getComponent(DialogueFields).props('timing')).toBe(false)
    expect(wrapper.find('[aria-label="开始毫秒 1"]').exists()).toBe(false)
    await wrapper.get('textarea[aria-label="英文句子 1"]').setValue('Tea, please.')
    await wrapper.get('textarea[aria-label="中文翻译 1"]').setValue('请来杯茶。')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '下移')!
      .trigger('click')
    expect(form.dialogue.map((row) => row.id)).toEqual(['SENTENCE-2', 'SENTENCE-1'])
    expect(form.dialogue[1]).toMatchObject({ english: 'Tea, please.', chinese: '请来杯茶。' })
    expect(form.vocabulary[0]!.source_sentence_ids).toEqual(['SENTENCE-1'])
  })

  it('keeps lexicon versions and source references while editing both sections of the parent draft', async () => {
    const { form, wrapper } = await mountPanel()
    await wrapper.get('input[aria-label="vocabulary 英文 1"]').setValue('tea')
    await wrapper.get('input[aria-label="chunk 中文 1"]').setValue('给你')
    expect(form.vocabulary[0]).toMatchObject({
      entry_id: 'WORD-1',
      entry_version: 3,
      english: 'tea',
      source_sentence_ids: ['SENTENCE-1']
    })
    expect(form.chunks[0]).toMatchObject({
      entry_id: 'CHUNK-1',
      entry_version: 2,
      chinese: '给你',
      source_sentence_ids: ['SENTENCE-2']
    })
    const [vocabulary, chunks] = wrapper.findAllComponents(LexiconFields)
    expect(vocabulary!.props('entryType')).toBe('vocabulary')
    expect(chunks!.props('entryType')).toBe('chunk')
    for (const section of [vocabulary!, chunks!]) {
      expect(section.props('sentences')).toBe(form.dialogue)
      expect(section.props('originalImageAssetId')).toBe('IMAGE-1')
    }
  })

  it('reports vocabulary and chunk media busy states separately to the parent', async () => {
    const { wrapper } = await mountPanel()
    const [vocabulary, chunks] = wrapper.findAllComponents(LexiconMediaFields)
    vocabulary!.vm.$emit('busy', true)
    await flushPromises()
    chunks!.vm.$emit('busy', true)
    await flushPromises()
    vocabulary!.vm.$emit('busy', false)
    await flushPromises()
    chunks!.vm.$emit('busy', false)
    await flushPromises()
    expect(wrapper.emitted('busy')).toEqual([
      ['vocabulary', true],
      ['chunks', true],
      ['vocabulary', false],
      ['chunks', false]
    ])
  })
})
