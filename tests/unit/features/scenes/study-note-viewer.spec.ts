import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
const { blob } = vi.hoisted(() => ({ blob: vi.fn() }))
vi.mock('@/services/http-client', () => ({ api: { blob } }))
import StudyNoteViewer from '@/features/scenes/study-note-viewer.vue'
afterEach(() => vi.restoreAllMocks())
it('reads only the authenticated admin PDF and releases its Blob URL on close', async () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  blob.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  const page = mount(StudyNoteViewer, {
    props: { mediaId: 'note' },
    global: { stubs: { ElDialog: { template: '<div><slot /></div>' } } }
  })
  await flushPromises()
  expect(blob).toHaveBeenCalledWith('/api/admin/v1/media/note')
  expect(create).toHaveBeenCalledTimes(1)
  expect(page.get('iframe').attributes('src')).toBe('blob:pdf')
  page.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:pdf')
})
it('does not create an orphan URL after the viewer is closed during download', async () => {
  let resolve: (value: Blob) => void = () => {}
  blob.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const create = vi.spyOn(URL, 'createObjectURL')
  const page = mount(StudyNoteViewer, {
    props: { mediaId: 'note' },
    global: { stubs: { ElDialog: true } }
  })
  page.unmount()
  resolve(new Blob(['pdf']))
  await flushPromises()
  expect(create).not.toHaveBeenCalled()
})
