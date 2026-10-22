import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', () => ({ api: { request } }))
import ScenePreview from './scene-preview.vue'

const content = {
  name: '点茶',
  title_en: 'Ordering Tea',
  image_id: 'image',
  audio_id: 'audio',
  dialogue: [{ id: 'line', speaker: 'A', english: 'Some tea, please.', chinese: '请给我一杯茶。' }],
  vocabulary: [
    {
      id: 'word',
      english: 'tea',
      meaning: '茶',
      phonetic: '',
      pronunciation_text: '',
      pronunciation_issue: false,
      source: { line_id: 'line', start: 5, end: 8, quote: 'tea' }
    }
  ],
  chunks: []
}
let stopped: ReturnType<typeof vi.fn>
let mounted: ReturnType<typeof mount> | undefined
beforeEach(() => {
  stopped = vi.fn()
  class AudioBoundary {
    destination = {}
    resume = vi.fn(async () => {})
    close = vi.fn(async () => {})
    decodeAudioData = vi.fn(async () => ({}))
    /** 浏览器音频边界保留实际组件发起与停止播放的观测点
     * @returns 可观测停止行为的音频节点
     */
    createBufferSource = () => ({
      buffer: null,
      onended: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: stopped
    })
  }
  vi.stubGlobal('AudioContext', AudioBoundary)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new ArrayBuffer(8)))
  )
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  request
    .mockReset()
    .mockImplementation(async (path: string) =>
      path.endsWith('/status')
        ? { id: 'audio', state: 'ready', content_type: 'audio/wav', duration_seconds: 10 }
        : { state: 'ready', url: '/api/admin/v1/pronunciation/synthetic', job_id: 'job' }
    )
})
afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

it.each(
  (['draft', 'published', 'import'] as const).flatMap((mode) =>
    ['word', 'full'].map((closingAudio) => ({ mode, closingAudio }))
  )
)(
  'renders real $mode preview controls without learner writes and stops $closingAudio audio on close',
  async ({ mode, closingAudio }) => {
    const reference = mode === 'published' ? { version_id: 'published-version' } : { revision: 2 }
    const pronunciation =
      mode === 'import'
        ? { import: { batchId: 'batch', itemId: 'item' }, reference: { revision: 2 } }
        : { cardId: 'card', reference }
    const page = mount(
      defineComponent({
        components: { ScenePreview },
        setup: () => ({ opened: ref(true), content, pronunciation, mode }),
        template:
          '<ScenePreview v-if="opened" :content="content" :mode="mode" :pronunciation="pronunciation" @close="opened = false" />'
      }),
      { attachTo: document.body, global: { plugins: [ElementPlus], stubs: { teleport: true } } }
    )
    mounted = page
    await flushPromises()
    expect(page.findComponent(ScenePreview).exists()).toBe(true)
    const publish = page
      .findAll('.preview-footer button')
      .find((item) => item.text() === '确认发布')
    expect(!!publish).toBe(mode === 'draft')
    expect(page.get('.favorite-preview').attributes('disabled')).toBeDefined()
    expect(page.get('.preview-completion').attributes('disabled')).toBeDefined()
    expect(page.get('[data-action="lookup-preview"]').attributes('disabled')).toBeDefined()
    expect(page.text()).toContain('中央查词仅作禁用示例')
    expect(
      page.findAll('[data-action="share"], [data-action="feedback"], [data-action="next"]')
    ).toHaveLength(0)
    expect(page.find('.translation-section').exists()).toBe(false)
    await page.get('[data-action="translation"]').trigger('click')
    expect(page.get('.translation-section').text()).toContain('请给我一杯茶。')
    await page.get('[aria-label="查看场景大图"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('场景大图')
    await page.get('[aria-label="场景大图"] .el-dialog__headerbtn').trigger('click')
    await flushPromises()
    await page.get('[data-word="word"]').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('播放中')
    const prefix =
      mode === 'import' ? '/api/admin/v1/imports/batch/items/item' : '/api/admin/v1/cards/card'
    expect(request.mock.calls).toContainEqual([
      `${prefix}/words/word/pronunciation`,
      { method: 'POST', body: reference }
    ])
    expect(
      request.mock.calls.filter(([, options]) => options?.method && options.method !== 'GET')
    ).toHaveLength(1)
    expect(request.mock.calls.every(([path]) => path.startsWith('/api/admin/v1/'))).toBe(true)
    const full = page.get('audio').element
    if (closingAudio === 'full') {
      Object.defineProperty(full, 'duration', { configurable: true, value: 10 })
      await page.get('audio').trigger('loadedmetadata')
      await page.get('.play-toggle').trigger('click')
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce()
      await page.get('audio').trigger('play')
      expect(page.get('.play-toggle').attributes('aria-label')).toBe('暂停完整音频')
    }
    const pause = vi.mocked(HTMLMediaElement.prototype.pause)
    pause.mockClear()
    await page.get('.preview-footer button').trigger('click')
    await flushPromises()
    expect(page.findComponent(ScenePreview).exists()).toBe(false)
    expect(pause.mock.instances).toContain(full)
    expect(stopped).toHaveBeenCalledOnce()
  }
)
