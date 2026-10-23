import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ApiError } from '@/services/http-client'

import type { ImportBatch, ImportFile } from '@/shared/types/import'

import ImportUploadPanel from './import-upload-panel.vue'

const { upload, request } = vi.hoisted(() => ({ upload: vi.fn(), request: vi.fn() }))
vi.mock('@/services/http-client', async (original) => ({
  ...(await original<typeof import('@/services/http-client')>()),
  api: { upload, request }
}))
const batch: ImportBatch = {
  id: 'batch',
  mode: 'zip',
  created_at: '',
  updated_at: '',
  resumable: false,
  stage: 'upload',
  source_names: [],
  files: [],
  items: [],
  unused_file_ids: []
}
const limits = {
  archive_limit_bytes: 1000,
  image_limit_bytes: 1000,
  audio_limit_bytes: 1000,
  import_card_limit: 50
}
const pages: ReturnType<typeof mount>[] = []
/** 挂载真实上传组件并保留测试清理记录
 * @param mode 当前批次选择的上传方式
 * @returns 本次组件实例
 */
const panel = (mode = 'zip') => {
  const page = mount(ImportUploadPanel, { props: { batch: { ...batch, mode }, limits } })
  pages.push(page)
  return page
}
/** 通过真实文件选择事件将资料加入待上传队列
 * @param page 本次上传组件
 * @param names 准备加入队列的文件名
 */
const choose = async (page: ReturnType<typeof panel>, names: string[]) => {
  const input = page.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: names.map((name) => new File(['zip'], name))
  })
  await input.trigger('change')
  await flushPromises()
}
/** 构造已由服务端接收的真实契约形状
 * @param name 已接收的ZIP名称
 * @returns 服务端已接收文件
 */
const accepted = (name: string): ImportFile => ({
  id: name,
  name,
  kind: 'zip',
  size: 3,
  state: 'processing',
  parent_id: '',
  job_id: 'job',
  error_code: null,
  media_id: null,
  progress: null
})

it('can remove an accepted ZIP while another file is still transferring', async () => {
  upload
    .mockResolvedValueOnce(accepted('one.zip'))
    .mockImplementationOnce(() => new Promise(() => {}))
  const page = panel()
  await choose(page, ['one.zip', 'two.zip'])
  await page.get('[data-action="start-upload"]').trigger('click')
  await flushPromises()
  const first = page.findAll('li').find((row) => row.text().includes('one.zip'))!
  await first.get('[data-action="remove-accepted-upload"]').trigger('click')
  expect(page.emitted('remove')?.at(-1)).toEqual([['one.zip']])
  expect(page.find('progress').exists()).toBe(true)
  await page.setProps({ removedFileIds: ['one.zip'] })
  expect(page.text()).not.toContain('one.zip')
  expect(page.text()).toContain('two.zip')
})
beforeEach(() => {
  vi.clearAllMocks()
})
it('accepts dropped ZIPs and shows byte progress separately from server parsing', async () => {
  let progress:
    ((value: { loaded: number; total: number | null; percent: number | null }) => void) | undefined
  upload.mockImplementation((_path, _form, _key, report) => {
    progress = report
    return new Promise(() => {})
  })
  const page = panel()
  await page
    .get('[data-action="zip-drop"]')
    .trigger('drop', { dataTransfer: { files: [new File(['zip'], '拖拽.zip')] } })
  expect(page.text()).toContain('拖拽.zip')
  await page.get('[data-action="start-upload"]').trigger('click')
  progress?.({ loaded: 1, total: 2, percent: 50 })
  await flushPromises()
  expect(page.get('progress').attributes('value')).toBe('50')
  progress?.({ loaded: 2, total: 2, percent: 100 })
  await flushPromises()
  expect(page.text()).toContain('上传完成，等待服务器确认')
  expect(page.text()).not.toContain('已发布')
})
afterEach(() => {
  for (const page of pages.splice(0)) page.unmount()
})

it('queues multiple ZIPs before upload and lets an unstarted file be removed', async () => {
  const page = panel()
  expect(page.get('input[type="file"]').attributes()).toHaveProperty('multiple')
  await choose(page, ['one.zip', 'two.zip', 'three.zip'])
  expect(upload).not.toHaveBeenCalled()
  expect(page.text()).toContain('待上传')
  expect(page.text()).toContain('3 B')
  await page
    .findAll('li')
    .find((row) => row.text().includes('two.zip'))!
    .get('[data-action="remove-upload"]')
    .trigger('click')
  expect(page.text()).not.toContain('two.zip')
  expect(page.emitted('pending')?.at(-1)).toEqual([2])
})

it('uploads serially, accepts appended ZIPs and continues after a known failure', async () => {
  let complete: (file: ImportFile) => void = () => {}
  upload
    .mockImplementationOnce(
      () =>
        new Promise<ImportFile>((resolve) => {
          complete = resolve
        })
    )
    .mockRejectedValueOnce(new ApiError('upload_limit', '文件超限', 413))
    .mockResolvedValueOnce(accepted('three.zip'))
  const page = panel()
  await choose(page, ['one.zip', 'two.zip'])
  await page.get('[data-action="start-upload"]').trigger('click')
  expect(upload).toHaveBeenCalledTimes(1)
  expect(page.get('input[type="file"]').attributes('disabled')).toBeUndefined()
  await choose(page, ['three.zip'])
  complete(accepted('one.zip'))
  await flushPromises()
  expect(upload).toHaveBeenCalledTimes(3)
  expect(
    upload.mock.calls
      .map((call) => (call[1] as FormData).get('file') as File)
      .map((file) => file.name)
  ).toEqual(['one.zip', 'two.zip', 'three.zip'])
  expect(page.text()).toContain('文件超限')
  expect(page.emitted('uploading')?.at(-1)).toEqual([false])
})

it('queries an unknown receipt and reuses the original upload key on retry', async () => {
  upload
    .mockRejectedValueOnce(new ApiError('network_unknown', '接收结果未知'))
    .mockResolvedValueOnce(accepted('one.zip'))
  request.mockRejectedValueOnce(new ApiError('missing', '未找到', 404))
  const page = panel()
  await choose(page, ['one.zip'])
  await page.get('[data-action="start-upload"]').trigger('click')
  await flushPromises()
  await page.get('[data-action="retry-upload"]').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledWith(`/api/admin/v1/operations/${upload.mock.calls[0]![2]}`)
  expect(upload.mock.calls[1]![2]).toBe(upload.mock.calls[0]![2])
  expect(page.text()).not.toContain('接收结果未知')
})

it('rejects invalid or oversized choices without blocking valid ZIPs', async () => {
  const page = panel()
  const input = page.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [
      new File(['x'.repeat(1001)], 'large.zip'),
      new File(['x'], 'bad.exe'),
      new File(['zip'], 'good.zip')
    ]
  })
  await input.trigger('change')
  await flushPromises()
  expect(page.text()).toContain('超过')
  expect(page.text()).toContain('请选择ZIP')
  expect(page.emitted('pending')?.at(-1)).toEqual([1])
})

it('retains immediate upload for the original independent DOCX entry', async () => {
  upload.mockResolvedValueOnce({ ...accepted('one.docx'), kind: 'docx' })
  const page = panel('docx')
  await choose(page, ['one.docx'])
  expect(upload).toHaveBeenCalledTimes(1)
  expect(upload.mock.calls[0]![0]).toContain('kind=docx')
  expect(page.emitted('pending')?.at(-1)).toEqual([0])
})

it('cancels one transfer, continues siblings and queries an accepted receipt without retransmitting it', async () => {
  upload
    .mockImplementationOnce(
      (_path, _body, _key, _progress, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new ApiError('upload_unknown', '传输已取消，接收结果待确认'))
          )
        })
    )
    .mockResolvedValueOnce(accepted('two.zip'))
  request.mockResolvedValueOnce({ result: accepted('one.zip') })
  const page = panel()
  await choose(page, ['one.zip', 'two.zip'])
  await page.get('[data-action="start-upload"]').trigger('click')
  await page
    .findAll('button')
    .find((button) => button.text() === '取消本次上传')!
    .trigger('click')
  await flushPromises()
  expect(upload).toHaveBeenCalledTimes(2)
  expect(page.text()).toContain('接收结果待确认')
  await page.get('[data-action="retry-upload"]').trigger('click')
  await flushPromises()
  expect(upload).toHaveBeenCalledTimes(2)
  expect(page.text()).not.toContain('接收结果待确认')
  expect(page.emitted('pending')?.at(-1)).toEqual([0])
})

it('accepts a confirmed receipt even when cancellation happens during the receipt query', async () => {
  let receipt: (value: unknown) => void = () => {}
  upload.mockRejectedValueOnce(new ApiError('network_unknown', '接收结果未知'))
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        receipt = resolve
      })
  )
  const page = panel()
  await choose(page, ['one.zip'])
  await page.get('[data-action="start-upload"]').trigger('click')
  await flushPromises()
  await page.get('[data-action="retry-upload"]').trigger('click')
  await page
    .findAll('button')
    .find((button) => button.text() === '取消本次上传')!
    .trigger('click')
  receipt({ result: accepted('one.zip') })
  await flushPromises()
  expect(page.emitted('pending')?.at(-1)).toEqual([0])
  expect(page.text()).not.toContain('查询／重试本文件')
  expect(upload).toHaveBeenCalledTimes(1)
  expect(page.emitted('refresh')).toHaveLength(1)
})

it('keeps a cancelled transfer unknown after an early missing receipt and never retransmits it', async () => {
  upload.mockImplementationOnce(
    (_path, _body, _key, _progress, signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(new ApiError('upload_unknown', '传输已取消，接收结果待确认'))
        )
      })
  )
  request.mockRejectedValueOnce(new ApiError('missing', '未找到', 404))
  const page = panel()
  await choose(page, ['one.zip'])
  await page.get('[data-action="start-upload"]').trigger('click')
  await page
    .findAll('button')
    .find((button) => button.text() === '取消本次上传')!
    .trigger('click')
  await flushPromises()
  await page.get('[data-action="retry-upload"]').trigger('click')
  await flushPromises()
  expect(upload).toHaveBeenCalledTimes(1)
  expect(page.text()).toContain('接收结果待确认')
  expect(page.find('[data-action="retry-upload"]').exists()).toBe(true)
  expect(page.emitted('pending')?.at(-1)).toEqual([0])
})

it('requires corrected originals for invalid sources and only retries applicable processing failures', async () => {
  const files: ImportFile[] = [
    { ...accepted('broken.zip'), state: 'failed', error_code: 'archive_invalid' },
    {
      ...accepted('format.wav'),
      state: 'failed',
      error_code: 'audio_format_mismatch',
      kind: 'audio',
      parent_id: 'broken.zip'
    },
    { ...accepted('interrupted.zip'), state: 'failed', error_code: 'worker_interrupted' }
  ]
  const page = mount(ImportUploadPanel, { props: { batch: { ...batch, files }, limits } })
  pages.push(page)
  const badPackage = page.findAll('li').find((row) => row.text().includes('broken.zip'))!
  expect(badPackage.findAll('button').some((button) => button.text().includes('重试'))).toBe(false)
  expect(badPackage.find('[data-action="remove-accepted-upload"]').exists()).toBe(true)
  expect(page.findAll('button').filter((button) => button.text().includes('重试'))).toHaveLength(1)
  expect(page.text()).toContain('重新选择')
  request.mockResolvedValueOnce({})
  await page
    .findAll('li')
    .find((row) => row.text().includes('interrupted.zip'))!
    .findAll('button')
    .find((button) => button.text().includes('重试'))!
    .trigger('click')
  await flushPromises()
  expect(
    request.mock.calls.filter(([path]) => path.includes('/retry')).map(([path]) => path)
  ).toEqual(['/api/admin/v1/imports/batch/files/interrupted.zip/retry'])
})

it('does not retry an invalid accepted receipt that is still held in the local upload queue', async () => {
  upload.mockResolvedValueOnce({
    ...accepted('broken.zip'),
    state: 'failed',
    error_code: 'archive_invalid'
  })
  const page = panel()
  await choose(page, ['broken.zip'])
  await page.get('[data-action="start-upload"]').trigger('click')
  await flushPromises()
  expect(page.findAll('button').filter((button) => button.text().includes('重试'))).toHaveLength(0)
  expect(page.text()).toContain('重新选择')
  expect(request.mock.calls.some(([path]) => path.includes('/retry'))).toBe(false)
})
