import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
const { request, upload } = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request, upload }
}))
import SceneDocxImport from './scene-docx-import.vue'

it('previews one staged DOCX and replaces only text after explicit confirmation', async () => {
  const candidate = {
    name: 'DOCX标题',
    image_id: null,
    audio_id: null,
    dialogue: [{ id: 'new-line', speaker: 'A', english: 'Hello.', chinese: '你好。' }],
    vocabulary: [],
    chunks: []
  }
  request.mockImplementation(async (path: string) =>
    path === '/api/admin/v1/imports'
      ? { id: 'batch', mode: 'single' }
      : {
          id: 'batch',
          files: [{ id: 'file', state: 'ready' }],
          items: [{ id: 'item', content: candidate, readable: true }]
        }
  )
  upload.mockResolvedValue({ id: 'file', state: 'processing' })
  const original = {
    name: '保留手工标题',
    image_id: 'old-image',
    audio_id: 'old-audio',
    dialogue: [],
    vocabulary: [],
    chunks: []
  }
  const page = mount(SceneDocxImport, {
    props: { content: original },
    global: {
      stubs: {
        ElDialog: { template: '<div><slot/><slot name="footer"/></div>' },
        SceneReader: true
      }
    }
  })
  const input = page.get('input[type=file]')
  Object.defineProperty(input.element, 'files', {
    value: [new File(['docx'], 'scene.docx')],
    configurable: true
  })
  await input.trigger('change')
  await flushPromises()
  expect(page.emitted('apply')).toBeUndefined()
  expect(page.text()).toContain('确认替换对话、词汇及语块')
  await page.get('[data-action="confirm-docx"]').trigger('click')
  expect(page.emitted('apply')).toEqual([
    [{ ...original, dialogue: candidate.dialogue, vocabulary: [], chunks: [] }]
  ])
  page.unmount()
})
