import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
const { request, upload } = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request, upload }
}))
import SceneDocxImport from './scene-docx-import.vue'

it('previews one staged DOCX and replaces confirmed titles and text while retaining media', async () => {
  const candidate = {
    name: 'DOCX标题',
    title_en: 'A New Title',
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
    title_en: '',
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
  expect(page.text()).toContain('确认替换标题及文本')
  await page.get('[data-action="confirm-docx"]').trigger('click')
  expect(page.emitted('apply')).toEqual([
    [
      {
        ...original,
        name: candidate.name,
        title_en: candidate.title_en,
        dialogue: candidate.dialogue,
        vocabulary: [],
        chunks: []
      }
    ]
  ])
  page.unmount()
})

it('shows recoverable English title conflicts and lets the editor confirm a corrected value', async () => {
  const candidate = {
    name: 'DOCX中文',
    title_en: '',
    image_id: null,
    audio_id: null,
    dialogue: [],
    vocabulary: [],
    chunks: []
  }
  request.mockImplementation(async (path: string) =>
    path === '/api/admin/v1/imports'
      ? { id: 'batch' }
      : {
          files: [{ id: 'file', state: 'ready' }],
          items: [
            {
              readable: true,
              content: candidate,
              issues: [
                {
                  field: 'title_en',
                  code: 'title_en_conflict',
                  message: '英文标题存在冲突，请核对确认'
                }
              ]
            }
          ]
        }
  )
  upload.mockResolvedValue({ id: 'file', state: 'processing' })
  const page = mount(SceneDocxImport, {
    props: { content: candidate },
    global: {
      stubs: {
        ElDialog: { template: '<div><slot/><slot name="footer"/></div>' },
        SceneReader: true
      }
    }
  })
  const input = page.get('input[type=file]')
  Object.defineProperty(input.element, 'files', { value: [new File(['docx'], 'conflict.docx')] })
  await input.trigger('change')
  await flushPromises()
  expect(page.text()).toContain('英文标题存在冲突，请核对确认')
  expect(page.emitted('apply')).toBeUndefined()
  await page.get('input[aria-label="核对英文标题"]').setValue('Confirmed English')
  await page.get('[data-action="confirm-docx"]').trigger('click')
  expect(page.emitted('apply')?.[0]?.[0]).toMatchObject({
    title_en: 'Confirmed English',
    name: 'DOCX中文'
  })
  page.unmount()
})
