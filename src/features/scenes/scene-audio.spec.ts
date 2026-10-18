import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request }
}))
import SceneAudio from './scene-audio.vue'

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
