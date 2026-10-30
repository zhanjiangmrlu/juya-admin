import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { emptyPayload } from './listening-model'

const upload = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: { ...module.api, upload } }
})
import ListeningDocxImport from './listening-docx-import.vue'

it('applies uniquely matched ownership only after confirmation and keeps current media', async () => {
  upload.mockResolvedValue({
    payload: { ...emptyPayload(), title_zh: '新标题' },
    hints: { 主题: 'A topic' },
    topic_id: 't'
  })
  const page = mount(ListeningDocxImport, {
    props: {
      payload: { ...emptyPayload(), audio_id: 'original-audio', image_id: 'original-image' }
    },
    global: {
      stubs: {
        ElDialog: {
          props: ['modelValue'],
          template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>'
        }
      }
    }
  })
  const input = page.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['doc'], 'content.docx')] })
  await input.trigger('change')
  await flushPromises()
  expect(page.emitted('apply')).toBeUndefined()
  expect(page.emitted('topic')).toBeUndefined()
  await page
    .findAll('button')
    .find((item) => item.text() === '确认带入以上资料')!
    .trigger('click')
  expect(page.emitted('apply')?.[0]?.[0]).toMatchObject({
    title_zh: '新标题',
    audio_id: 'original-audio',
    image_id: 'original-image'
  })
  expect(page.emitted('topic')).toEqual([['t']])
  page.unmount()
})
