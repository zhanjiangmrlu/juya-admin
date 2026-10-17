import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', () => ({ api: { request } }))
import SceneReader from './scene-reader.vue'
it('pauses full audio without losing its position and ignores a late previous word', async () => {
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = []
  class AudioBoundary {
    destination = {}
    resume = vi.fn(async () => {})
    close = vi.fn(async () => {})
    decodeAudioData = vi.fn(async () => ({}))
    createBufferSource() {
      const source = {
        buffer: null,
        onended: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      }
      sources.push(source)
      return source
    }
  }
  vi.stubGlobal('AudioContext', AudioBoundary)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
  )
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  let resolveFirst!: (value: unknown) => void
  request.mockImplementation((path: string) =>
    path.includes('word-one')
      ? new Promise((resolve) => {
          resolveFirst = resolve
        })
      : Promise.resolve({
          state: 'ready',
          url: '/api/admin/v1/pronunciation/second',
          job_id: 'two',
          error_code: null,
          retry_after: null
        })
  )
  const page = mount(SceneReader, {
    attachTo: document.body,
    props: {
      pronunciation: { cardId: 'card', reference: { revision: 2 } },
      content: {
        name: 'test',
        image_id: null,
        audio_id: 'full',
        dialogue: [],
        vocabulary: [
          {
            id: 'word-one',
            english: 'one',
            meaning: '一',
            phonetic: '',
            pronunciation_text: '',
            pronunciation_issue: false
          },
          {
            id: 'word-two',
            english: 'two',
            meaning: '二',
            phonetic: '',
            pronunciation_text: '',
            pronunciation_issue: false
          }
        ],
        chunks: []
      }
    }
  })
  try {
    const full = page.get('audio').element as HTMLAudioElement
    full.currentTime = 12
    await page.get('[data-word="word-one"]').trigger('click')
    await flushPromises()
    await page.get('[data-word="word-two"]').trigger('click')
    await flushPromises()
    expect(pause).toHaveBeenCalled()
    expect(full.currentTime).toBe(12)
    expect(sources).toHaveLength(1)
    expect(sources[0]!.start).toHaveBeenCalledOnce()
    resolveFirst({
      state: 'ready',
      url: '/api/admin/v1/pronunciation/old',
      job_id: 'one',
      error_code: null,
      retry_after: null
    })
    await flushPromises()
    expect(sources).toHaveLength(1)
  } finally {
    page.unmount()
    pause.mockRestore()
    vi.unstubAllGlobals()
  }
})
