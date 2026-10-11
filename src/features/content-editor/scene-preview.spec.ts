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
  it('shows complete source entry details directly without a clickable-text glossary', async () => {
    const wrapper = setup()
    await flushPromises()
    expect(wrapper.find('.word-link').exists()).toBe(false)
    const card = wrapper.get('article.entry-card')
    expect(card.text()).toContain('此处指解决排班问题。')
    expect(card.text()).toContain('How can we solve this problem?')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })
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

  it('plays a fixed entry file beside the displayed source details and keeps whole-audio available', async () => {
    const wrapper = setup()
    await flushPromises()
    const card = wrapper.get('article.entry-card')
    const button = card.get('button[aria-label="播放 solve 发音"]')
    await button.trigger('click')
    await flushPromises()
    expect(wrapper.get('audio').element.src).toContain('/word.wav')
    expect(button.attributes('aria-label')).toBe('暂停 solve 发音')
    await wrapper
      .findAll('button')
      .find((item) => item.text() === '播放整段音频')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('audio').element.src).toContain('/scene.wav')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('omits inapplicable phonetics and empty playback controls when an entry has no pronunciation', async () => {
    const wrapper = setup(false)
    await flushPromises()
    const card = wrapper.get('article.entry-card')
    expect(card.find('.entry-phonetic').exists()).toBe(false)
    expect(card.text()).toContain('暂无独立发音')
    expect(card.find('.entry-play').exists()).toBe(false)
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

  /** 验证草稿撤去音频时隐藏控件并释放旧录音 */
  it('hides an unbound player and clears the previous recording when a draft has no audio', async () => {
    const wrapper = setup()
    await flushPromises()
    expect(wrapper.get('audio').element.src).toContain('/scene.wav')
    await wrapper.setProps({ content: normalizeSceneContent({ title_en: 'Limited Scene' }) })
    await flushPromises()
    expect(wrapper.get('audio').isVisible()).toBe(false)
    expect(wrapper.get('audio').attributes('src')).toBeUndefined()
    expect(wrapper.findAll('button').some((button) => button.text().includes('整段音频'))).toBe(
      false
    )
    expect(wrapper.text()).toContain('尚未绑定整段音频')
    wrapper.unmount()
  })
})

it('previews an existing fixed pronunciation target without creating a synthesis task', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
  request.mockImplementation(({ path }: { path: string }) => {
    if (path.endsWith('/targets/fixed'))
      return Promise.resolve({ target_id: 'fixed', resource_version: 'cached-v1' })
    if (path.endsWith('/targets/fixed/preview'))
      return Promise.resolve({ resource_version: 'cached-v1', url: '/cached.wav' })
    return Promise.resolve({ url: '/scene.wav' })
  })
  const wrapper = setup(false)
  const content = normalizeSceneContent(wrapper.props('content'))
  content.vocabulary[0]!.pronunciation_target_id = 'fixed'
  await wrapper.setProps({ content })
  await flushPromises()
  await wrapper.get('article.entry-card button.entry-play').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledWith({
    method: 'POST',
    path: '/api/v1/admin/pronunciations/targets/fixed/preview',
    body: { resource_version: 'cached-v1' }
  })
  expect(wrapper.get('audio').element.src).toContain('/cached.wav')
  expect(request.mock.calls.some(([call]) => String(call.path).includes('/resolve'))).toBe(false)
  wrapper.unmount()
})
