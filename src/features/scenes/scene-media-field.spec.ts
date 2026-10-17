import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

const { request, upload } = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request, upload }
}))
import { ApiError } from '@/services/http-client'

import SceneMediaField from './scene-media-field.vue'

it('cancels waiting without replacing the old image and recovers acceptance before retransmitting', async () => {
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
    props: { kind: 'image', modelValue: 'old-image', limit: 10000 }
  })
  const input = page.get('input[type=file]')
  Object.defineProperty(input.element, 'files', {
    value: [new File(['test'], 'new.png', { type: 'image/png' })],
    configurable: true
  })
  await input.trigger('change')
  await flushPromises()
  await page.get('[data-action="cancel-upload"]').trigger('click')
  await flushPromises()
  expect(page.emitted('update:modelValue')).toBeUndefined()
  expect(page.get('img').attributes('src')).toContain('old-image')
  await page.get('[data-action="recover-upload"]').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledWith(`/api/admin/v1/operations/${originalKey}`)
  expect(upload).toHaveBeenCalledTimes(1)
  expect(page.emitted('update:modelValue')).toEqual([['new-image']])
  expect(page.emitted('busy')).toEqual([[true], [false], [true], [false]])
  page.unmount()
})
