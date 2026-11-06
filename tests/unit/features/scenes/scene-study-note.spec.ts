import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
const { request, upload } = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { request, upload }
}))
import SceneStudyNote from '@/features/scenes/scene-study-note.vue'
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
const old = {
  id: 'old',
  state: 'ready',
  original_name: '原笔记.pdf',
  size: 25,
  kind: 'study_note',
  content_type: 'application/pdf',
  width: null,
  height: null,
  duration: null,
  error: null,
  thumbnail_id: null
}
const draft = { action: 'keep' as const, attachment: old, can_publish: true }
/** 在独立组件中选择用于校验的PDF
 * @param page 当前挂载的笔记组件
 */
const choose = async (page: ReturnType<typeof mount>) => {
  const input = page.get('input[type=file]')
  Object.defineProperty(input.element, 'files', {
    value: [new File(['pdf'], '新笔记.pdf')],
    configurable: true
  })
  await input.trigger('change')
  await flushPromises()
}
it('persists accepted pending PDF while upload 100% does not mark it ready and failure retains old PDF', async () => {
  vi.useFakeTimers()
  upload.mockResolvedValue({
    id: 'next',
    state: 'processing',
    original_name: '新笔记.pdf',
    size: 3
  })
  request.mockResolvedValue({
    id: 'next',
    state: 'failed',
    error: 'PDF损坏',
    original_name: '新笔记.pdf'
  })
  const page = mount(SceneStudyNote, { props: { draft, limit: 1000 } })
  await choose(page)
  expect(page.emitted('update:modelValue')).toEqual([[{ action: 'set', media_id: 'next' }]])
  expect(page.text()).toContain('正在校验')
  expect(page.text()).toContain('原笔记.pdf')
  await vi.advanceTimersByTimeAsync(1000)
  await flushPromises()
  expect(page.text()).toContain('PDF损坏')
  expect(page.text()).toContain('原笔记.pdf')
  await page.get('[data-action="cancel-study-note"]').trigger('click')
  expect(page.emitted('update:modelValue')?.at(-1)).toEqual([{ action: 'keep' }])
  page.unmount()
})
it('ignores a late upload receipt after cancelling replacement', async () => {
  let finish: (value: unknown) => void = () => {}
  upload.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const page = mount(SceneStudyNote, { props: { draft, limit: 1000 } })
  await choose(page)
  await page.get('[data-action="cancel-study-note"]').trigger('click')
  finish({ id: 'late', state: 'ready' })
  await flushPromises()
  expect(page.emitted('update:modelValue')).toEqual([[{ action: 'keep' }]])
  page.unmount()
})
it('requires explicit radio selection for multiple ZIP PDFs and explicit remove for no PDF', async () => {
  const page = mount(SceneStudyNote, {
    props: {
      draft: {
        action: 'unresolved',
        can_publish: false,
        candidates: [
          {
            file_id: 'a',
            name: 'a.pdf',
            media_id: 'a',
            state: 'ready',
            size: 2,
            parent_id: 'zip',
            error_code: null
          },
          {
            file_id: 'b',
            name: 'b.pdf',
            media_id: 'b',
            state: 'failed',
            size: 2,
            parent_id: 'zip',
            error_code: 'study_note_invalid'
          }
        ]
      },
      limit: 1000,
      source: '资料.zip / 目录A'
    }
  })
  expect(page.text()).toContain('资料.zip / 目录A')
  await page.get('input[type=radio][value=a]').setValue()
  expect(page.emitted('update:modelValue')?.at(-1)).toEqual([{ action: 'set', media_id: 'a' }])
  await page.get('input[type=radio][value=remove]').setValue()
  expect(page.emitted('update:modelValue')?.at(-1)).toEqual([{ action: 'remove' }])
  page.unmount()
})
it('recovers an unknown receipt using the original idempotency key before retransmitting', async () => {
  const { ApiError } = await import('@/services/http-client')
  upload.mockRejectedValueOnce(new ApiError('network_unknown', '未知响应'))
  request.mockResolvedValueOnce({ result: { ...old, id: 'recovered' } })
  const page = mount(SceneStudyNote, { props: { draft, limit: 1000 } })
  await choose(page)
  const key = upload.mock.calls[0]![2]
  await page
    .findAll('button')
    .find((button) => button.text().includes('重试／继续查询'))!
    .trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledWith(`/api/admin/v1/operations/${key}`)
  expect(upload).toHaveBeenCalledTimes(1)
  expect(page.emitted('update:modelValue')?.at(-1)).toEqual([
    { action: 'set', media_id: 'recovered' }
  ])
  page.unmount()
})
it('keeps a locally rejected PDF unresolved until the administrator explicitly cancels', async () => {
  const page = mount(SceneStudyNote, { props: { draft, limit: 1 } })
  await choose(page)
  expect(page.emitted('update:modelValue')?.at(-1)).toEqual([{ action: 'unresolved' }])
  expect(page.emitted('blocked')?.at(-1)).toEqual([true])
  await page.get('[data-action="cancel-study-note"]').trigger('click')
  expect(page.emitted('update:modelValue')?.at(-1)).toEqual([{ action: 'keep' }])
  page.unmount()
})
it('shows the persisted validation reason after reopening a failed draft', async () => {
  const page = mount(SceneStudyNote, {
    props: {
      draft: {
        ...draft,
        action: 'set',
        can_publish: false,
        pending_attachment: { ...old, id: 'failed', state: 'failed', error: 'PDF已加密，无法打开' }
      },
      limit: 1000
    }
  })
  expect(page.text()).toContain('PDF已加密，无法打开')
  page.unmount()
})
it('cancels C back to the saved draft B rather than reverting the draft to prior A', async () => {
  upload.mockResolvedValueOnce({ ...old, id: 'C', state: 'failed', error: 'invalid' })
  const page = mount(SceneStudyNote, {
    props: { draft: { ...draft, action: 'set', attachment: { ...old, id: 'B' } }, limit: 1000 }
  })
  await choose(page)
  await page.get('[data-action="cancel-study-note"]').trigger('click')
  expect(page.emitted('update:modelValue')?.at(-1)).toEqual([{ action: 'set', media_id: 'B' }])
  page.unmount()
})
it('cancels C back to a ready unsaved B', async () => {
  upload
    .mockResolvedValueOnce({ ...old, id: 'B', original_name: 'B.pdf' })
    .mockResolvedValueOnce({ ...old, id: 'C', state: 'failed' })
  const page = mount(SceneStudyNote, { props: { draft, limit: 1000 } })
  await choose(page)
  const input = page.get('input[type=file]')
  Object.defineProperty(input.element, 'files', {
    value: [new File(['C'], 'C.pdf')],
    configurable: true
  })
  await input.trigger('change')
  await flushPromises()
  expect(page.text()).toContain('B.pdf')
  await page.get('[data-action="cancel-study-note"]').trigger('click')
  expect(page.emitted('update:modelValue')?.at(-1)).toEqual([{ action: 'set', media_id: 'B' }])
  expect(page.text()).toContain('B.pdf')
  page.unmount()
})
it('ignores an operation 404 that arrives after the replacement was cancelled', async () => {
  const { ApiError } = await import('@/services/http-client')
  upload.mockRejectedValueOnce(new ApiError('network_unknown', 'unknown'))
  let reject: (reason: Error) => void = () => {}
  request.mockImplementationOnce(
    () =>
      new Promise((_done, fail) => {
        reject = fail
      })
  )
  const page = mount(SceneStudyNote, { props: { draft, limit: 1000 } })
  await choose(page)
  await page
    .findAll('button')
    .find((button) => button.text().includes('重试／继续查询'))!
    .trigger('click')
  await flushPromises()
  await page.get('[data-action="cancel-study-note"]').trigger('click')
  reject(new ApiError('not_found', 'missing', 404))
  await flushPromises()
  expect(upload).toHaveBeenCalledTimes(1)
  expect(page.emitted('transfer')?.at(-1)).toEqual([false])
  expect(page.get('input[type=file]').attributes('disabled')).toBeUndefined()
  page.unmount()
})
it('keeps a new selection when a cancelled older receipt returns 404', async () => {
  const { ApiError } = await import('@/services/http-client')
  upload
    .mockRejectedValueOnce(new ApiError('network_unknown', 'unknown'))
    .mockResolvedValueOnce({ ...old, id: 'fresh', original_name: 'fresh.pdf' })
  let reject: (reason: Error) => void = () => {}
  request.mockImplementationOnce(
    () =>
      new Promise((_done, fail) => {
        reject = fail
      })
  )
  const page = mount(SceneStudyNote, { props: { draft, limit: 1000 } })
  await choose(page)
  await page
    .findAll('button')
    .find((button) => button.text().includes('重试／继续查询'))!
    .trigger('click')
  await flushPromises()
  await page.get('[data-action="cancel-study-note"]').trigger('click')
  await choose(page)
  reject(new ApiError('not_found', 'missing', 404))
  await flushPromises()
  expect(upload).toHaveBeenCalledTimes(2)
  expect(page.emitted('update:modelValue')?.at(-1)).toEqual([{ action: 'set', media_id: 'fresh' }])
  expect(page.get('input[type=file]').attributes('disabled')).toBeUndefined()
  page.unmount()
})
it('uses keep to cancel a failed replacement that was already persisted', async () => {
  upload.mockResolvedValueOnce({ ...old, id: 'C', state: 'failed' })
  const page = mount(SceneStudyNote, {
    props: {
      draft: { ...draft, action: 'set', attachment: { ...old, id: 'B' } },
      modelValue: null,
      limit: 1000
    }
  })
  await choose(page)
  await page.setProps({ modelValue: { action: 'set', media_id: 'C' } })
  await page.setProps({
    modelValue: null,
    draft: {
      action: 'set',
      attachment: { ...old, id: 'B' },
      pending_attachment: { ...old, id: 'C', state: 'failed' },
      can_publish: false
    }
  })
  await page.get('[data-action="cancel-study-note"]').trigger('click')
  expect(page.emitted('update:modelValue')?.at(-1)).toEqual([{ action: 'keep' }])
  page.unmount()
})
it('persists ready unsaved B together with pending C as the explicit previous attachment', async () => {
  upload
    .mockResolvedValueOnce({ ...old, id: 'B', original_name: 'B.pdf' })
    .mockResolvedValueOnce({ ...old, id: 'C', state: 'failed' })
  const page = mount(SceneStudyNote, { props: { draft, limit: 1000 } })
  await choose(page)
  await choose(page)
  expect(page.emitted('update:modelValue')?.at(-1)).toEqual([
    { action: 'set', media_id: 'C', previous_media_id: 'B' }
  ])
  page.unmount()
})
it('restores the previous unknown upload key and receipt query after cancelling C', async () => {
  const { ApiError } = await import('@/services/http-client')
  upload
    .mockRejectedValueOnce(new ApiError('network_unknown', 'unknown'))
    .mockResolvedValueOnce({ ...old, id: 'C', state: 'failed' })
  const page = mount(SceneStudyNote, { props: { draft, limit: 1000 } })
  await choose(page)
  const originalKey = upload.mock.calls[0]![2]
  await choose(page)
  await page.get('[data-action="cancel-study-note"]').trigger('click')
  request.mockResolvedValueOnce({ result: { ...old, id: 'recovered-B' } })
  await page
    .findAll('button')
    .find((button) => button.text().includes('重试／继续查询'))!
    .trigger('click')
  await flushPromises()
  expect(request).toHaveBeenLastCalledWith(`/api/admin/v1/operations/${originalKey}`)
  expect(upload).toHaveBeenCalledTimes(2)
  page.unmount()
})
