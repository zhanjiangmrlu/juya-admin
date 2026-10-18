import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

const { request, upload } = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request, upload }
}))
import { ApiError } from '@/services/http-client'

import SceneMediaField from './scene-media-field.vue'
afterEach(() => vi.useRealTimers())

it('shows accepted audio validation while keeping the old reference until it is ready', async () => {
  vi.useFakeTimers()
  let finish: (value: unknown) => void = () => {}
  request.mockImplementation((path: string) =>
    path.includes('new-audio')
      ? new Promise((resolve) => {
          finish = resolve
        })
      : Promise.resolve({ id: 'old-audio', state: 'ready', duration: 2 })
  )
  upload.mockResolvedValueOnce({ id: 'new-audio', state: 'processing', original_name: 'new.wav' })
  const page = mount(SceneMediaField, {
    props: { kind: 'audio', modelValue: 'old-audio', limit: 10000 }
  })
  const input = page.get('input[type=file]')
  Object.defineProperty(input.element, 'files', { value: [new File(['wav'], 'new.wav')] })
  await input.trigger('change')
  await flushPromises()
  expect(page.text()).toContain('上传完成，正在校验音频')
  expect(page.emitted('update:modelValue')).toBeUndefined()
  await vi.advanceTimersByTimeAsync(1000)
  finish({ id: 'new-audio', state: 'failed', error: '音频无效' })
  await flushPromises()
  expect(page.emitted('update:modelValue')).toBeUndefined()
  expect(page.text()).toContain('音频无效')
  page.unmount()
})

it.each(['image', 'audio'] as const)(
  'cancels %s replacement and recovers acceptance before retransmitting',
  async (kind) => {
    let originalKey = ''
    request.mockImplementation(async (path: string) =>
      path.includes('/operations/')
        ? { result: { id: 'new-image', state: 'ready', original_name: 'new.png' } }
        : { id: 'old-image', state: 'ready' }
    )
    upload.mockImplementation((_path, _form, key, _progress, signal: AbortSignal) => {
      originalKey = key
      return new Promise((_resolve, reject) =>
        signal?.addEventListener('abort', () =>
          reject(new ApiError('upload_unknown', '接收结果待确认'))
        )
      )
    })
    const page = mount(SceneMediaField, {
      props: { kind, modelValue: 'old-image', limit: 10000 }
    })
    const input = page.get('input[type=file]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['test'], kind === 'image' ? 'new.png' : 'new.wav')],
      configurable: true
    })
    await input.trigger('change')
    await flushPromises()
    await page.get('[data-action="cancel-upload"]').trigger('click')
    await flushPromises()
    expect(page.emitted('update:modelValue')).toBeUndefined()
    expect(page.get(kind === 'image' ? 'img' : 'audio').attributes('src')).toContain('old-image')
    await page.get('[data-action="recover-upload"]').trigger('click')
    await flushPromises()
    expect(request).toHaveBeenCalledWith(`/api/admin/v1/operations/${originalKey}`)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(page.emitted('update:modelValue')).toEqual([['new-image']])
    expect(page.emitted('busy')).toEqual([[true], [false], [true], [false]])
    page.unmount()
  }
)

it('prepares a legacy audio reference explicitly without uploading or replacing its identity', async () => {
  request.mockImplementation(async (path: string) => ({
    id: 'legacy',
    state: 'ready',
    content_type: 'audio/wav',
    playback_id: path.endsWith('/retry') ? 'playback' : null,
    playback_content_type: path.endsWith('/retry') ? 'audio/mpeg' : null
  }))
  const page = mount(SceneMediaField, {
    props: { kind: 'audio', modelValue: 'legacy', limit: 10000 },
    global: { stubs: { SceneAudio: { template: '<div />', methods: { stop: () => {} } } } }
  })
  await flushPromises()
  expect(page.text()).toContain('历史音频需兼容处理后才能重新发布')
  await page.get('[data-action="prepare-legacy-audio"]').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledWith(
    '/api/admin/v1/media/legacy/retry',
    expect.objectContaining({ method: 'POST' })
  )
  expect(page.emitted('update:modelValue')).toBeUndefined()
  expect(page.find('[data-action="prepare-legacy-audio"]').exists()).toBe(false)
  page.unmount()
})
