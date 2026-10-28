import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
import SceneAudio from './scene-audio.vue'

it('supports a controlled listening source and inline five-rate controls without querying scene media', async () => {
  request.mockClear()
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const page = mount(SceneAudio, {
    props: {
      mediaId: 'article-audio',
      sourceUrl: '/api/admin/v1/listening/articles/a/media/audio',
      variant: 'preview',
      inlineRates: true,
      title: '完整英文音频'
    }
  })
  await flushPromises()
  expect(request).not.toHaveBeenCalled()
  expect(page.get('audio').attributes('src')).toContain('/listening/articles/a/media/audio')
  const element = page.get('audio')
  Object.defineProperty(element.element, 'duration', { configurable: true, value: 30 })
  await element.trigger('loadedmetadata')
  await page.get('[aria-label="展开完整音频倍速"]').trigger('click')
  expect(page.findAll('.inline-rates button')).toHaveLength(5)
  await page.findAll('.inline-rates button')[2]!.trigger('click')
  expect(element.element.playbackRate).toBe(1.5)
  expect(element.element.paused).toBe(true)
  page.unmount()
  pause.mockRestore()
})

it('uses real playback, seeking and rate changes in the preview player', async () => {
  request.mockResolvedValue({
    id: 'preview',
    kind: 'audio',
    state: 'ready',
    duration: 61,
    original_name: '完整对话.mp3'
  })
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  const page = mount(SceneAudio, { props: { mediaId: 'preview', variant: 'preview' } })
  await flushPromises()
  const element = page.get('audio')
  Object.defineProperty(element.element, 'duration', { configurable: true, value: 61 })
  await element.trigger('loadedmetadata')
  const toggle = page.find('button[aria-label="播放完整音频"]')
  expect(toggle.exists()).toBe(true)
  await toggle.trigger('click')
  expect(play).toHaveBeenCalledOnce()
  await element.trigger('play')
  Object.defineProperty(element.element, 'paused', { configurable: true, value: false })
  pause.mockClear()
  await page.get('button[aria-label="暂停完整音频"]').trigger('click')
  expect(pause).toHaveBeenCalledOnce()
  await page.get('input[aria-label="完整音频播放进度"]').setValue('20')
  expect(element.element.currentTime).toBe(20)
  await page.get('select[aria-label="完整音频倍速"]').setValue('1.5')
  expect(element.element.playbackRate).toBe(1.5)
  page.unmount()
  play.mockRestore()
  pause.mockRestore()
})

it('retains the uploaded fact on client load failure and stops the previous card audio', async () => {
  request.mockResolvedValue({
    id: 'a',
    kind: 'audio',
    state: 'ready',
    duration: 61,
    original_name: '对话.wav'
  })
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const page = mount(SceneAudio, { props: { mediaId: 'a' } })
  await flushPromises()
  expect(page.text()).toContain('已上传')
  expect(page.text()).toContain('时长读取中')
  const audio = page.get('audio')
  Object.defineProperty(audio.element, 'duration', { configurable: true, value: 61 })
  await audio.trigger('loadedmetadata')
  expect(page.text()).toContain('1:01')
  expect(audio.attributes('controls')).toBeDefined()
  await audio.trigger('error')
  expect(page.text()).toContain('已上传')
  expect(page.text()).toContain('音频读取失败')
  await page.setProps({ mediaId: 'b' })
  await flushPromises()
  expect(pause).toHaveBeenCalled()
  page.unmount()
  pause.mockRestore()
})

it('clears a previous playback rejection when the same audio starts successfully', async () => {
  request.mockResolvedValue({ id: 'retry', kind: 'audio', state: 'ready', duration: 61 })
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new Error('blocked'))
    .mockResolvedValue()
  const page = mount(SceneAudio, { props: { mediaId: 'retry', variant: 'preview' } })
  await flushPromises()
  const audio = page.get('audio')
  Object.defineProperty(audio.element, 'duration', { configurable: true, value: 61 })
  await audio.trigger('loadedmetadata')
  await page.get('button[aria-label="播放完整音频"]').trigger('click')
  await flushPromises()
  expect(page.get('[role="alert"]').text()).toContain('音频播放失败')
  await page.get('button[aria-label="播放完整音频"]').trigger('click')
  await audio.trigger('play')
  expect(page.find('[role="alert"]').exists()).toBe(false)
  page.unmount()
  play.mockRestore()
  pause.mockRestore()
})
