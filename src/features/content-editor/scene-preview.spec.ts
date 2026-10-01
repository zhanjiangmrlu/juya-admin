import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDialogueRow, createLexiconRow, normalizeSceneContent } from './scene-form'
import ScenePreview from './scene-preview.vue'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/api/use-admin-api-client', () => ({
  useAdminApiClient: () => ({ request })
}))

function setup(withPronunciation = true) {
  const sentence = {
    ...createDialogueRow(),
    id: 'sentence-1',
    english: 'How can we solve this problem?',
    chinese: '我们如何解决这个问题？',
    clickable_spans: [{ start: 11, end: 16, entry_id: 'solve', entry_version: 2 }]
  }
  const entry = {
    ...createLexiconRow(),
    entry_id: 'solve',
    entry_version: 2,
    english: 'solve',
    phonetic: withPronunciation ? '/sɑːlv/' : '',
    chinese: '解决',
    explanation: '此处指解决排班问题。',
    source_sentence_ids: ['sentence-1'],
    audio_version_id: withPronunciation ? 'word-version' : null
  }
  return mount(ScenePreview, {
    attachTo: document.body,
    props: {
      revisionId: 'draft',
      content: normalizeSceneContent({
        title_en: 'A Better Way to Work',
        dialogue: [sentence],
        vocabulary: [entry],
        audio: {
          target_id: 'target',
          version_id: 'version',
          asset_id: 'scene-audio',
          duration_ms: 24380
        }
      })
    },
    global: { plugins: [ElementPlus], stubs: { teleport: true, transition: false } }
  })
}

describe('scene preview pronunciation', () => {
  beforeEach(() => {
    request
      .mockReset()
      .mockImplementation(({ path }: { path: string }) =>
        Promise.resolve({ url: path.includes('word-version') ? '/word.wav' : '/scene.wav' })
      )
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('offers the word pronunciation beside its heading and returns to the original sentence', async () => {
    const wrapper = setup()
    await flushPromises()
    await wrapper.get('.word-link').trigger('click')
    const card = wrapper.get('.entry-sheet')
    expect(card.get('.entry-heading').text()).toContain('solve')
    expect(card.get('.entry-phonetic').text()).toBe('/sɑːlv/')
    expect(card.text()).toContain('此处指解决排班问题。')
    expect(card.text()).toContain('How can we solve this problem?')
    const button = card.get('button[aria-label="播放 solve 发音"]')
    await button.trigger('click')
    await flushPromises()
    expect(wrapper.get('audio').element.src).toContain('/word.wav')
    expect(button.attributes('aria-label')).toBe('暂停 solve 发音')
    await card
      .findAll('button')
      .find((item) => item.text() === '返回原文')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('.entry-sheet').exists()).toBe(false)
    expect(wrapper.get('.word-link').element).toBe(document.activeElement)
    expect(wrapper.get('audio').element.src).toContain('/scene.wav')
    vi.spyOn(wrapper.get('audio').element, 'paused', 'get').mockReturnValue(false)
    await wrapper.get('audio').trigger('playing')
    expect(wrapper.text()).toContain('当前：整段音频')
    wrapper.findComponent({ name: 'ElDialog' }).vm.$emit('close')
    await flushPromises()
    expect(wrapper.text()).toContain('当前：整段音频')
    wrapper.unmount()
  })

  it('keeps missing pronunciation and phonetics explicit without enabling an empty audio source', async () => {
    const wrapper = setup(false)
    await flushPromises()
    await wrapper.get('.word-link').trigger('click')
    const card = wrapper.get('.entry-sheet')
    expect(card.text()).toContain('音标待补充')
    expect(card.text()).toContain('暂无独立发音')
    expect(card.get('button[aria-label="播放 solve 发音"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('exposes native volume controls and lets a failed whole-audio request refresh its signed source', async () => {
    const wrapper = setup()
    await flushPromises()
    expect(wrapper.get('audio').attributes('controls')).toBeDefined()
    const play = wrapper.findAll('button').find((button) => button.text() === '播放整段音频')!
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('expired source'))
    await play.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('播放失败')
    request.mockImplementation(() => Promise.resolve({ url: '/renewed.wav' }))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '刷新音频后重试')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('audio').element.src).toContain('/renewed.wav')
    await play.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('播放中')
    wrapper.unmount()
  })
})
